"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  Send,
  Loader2,
  Clock,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InterviewPhase } from "@/lib/types";

type ChatMessage = { role: "interviewer" | "candidate"; content: string };

export default function CandidateInterviewPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [phase, setPhase] = useState<InterviewPhase>("loading");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [interviewConfig, setInterviewConfig] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");

  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(10);
  const [elapsed, setElapsed] = useState(0);
  const [tabSwitches, setTabSwitches] = useState(0);

  const [reconnecting, setReconnecting] = useState(false);
  const [, setReconnectFailed] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalCloseRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interviewActiveRef = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getPublicInterview(token);
        if (data.status === "completed") {
          setPhase("completed");
          return;
        }
        const config = (data.interview_config as Record<string, unknown>) || {};
        const includeCoding = config.include_coding === true;
        const format = (data.format as string) || "text";
        if (includeCoding) {
          router.replace(`/interview/${token}/code`);
          return;
        }
        if (format === "voice") {
          router.replace(`/interview/${token}/voice`);
          return;
        }
        if (format === "video") {
          router.replace(`/interview/${token}/video`);
          return;
        }
        setJobTitle(data.job_title as string || "");
        setJobDescription(data.job_description as string || "");
        setInterviewConfig(config);
        setTotal((config.num_questions as number) || 10);
        setPhase("consent");
      } catch {
        setError("Interview not found or link expired.");
        setPhase("error");
      }
    }
    load();
  }, [token, router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    function handleVisibility() {
      if (document.hidden && phase === "interview") {
        setTabSwitches((p) => p + 1);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [phase]);

  async function handleConsent(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.startInterview(token, {
        candidate_name: candidateName,
        candidate_email: candidateEmail,
      });
      setPhase("ready");
    } catch {
      setError("Failed to start interview.");
      setPhase("error");
    }
  }

  const connectWebSocket = useCallback(() => {
    intentionalCloseRef.current = false;
    const wsUrl =
      (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8001") +
      `/ws/interview/${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    ws.onopen = () => {
      setReconnecting(false);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "question") {
        setMessages((m) => [...m, { role: "interviewer", content: data.content }]);
        setThinking(false);
        setProgress(data.progress || 0);
        setTotal(data.total || 10);
      } else if (data.type === "thinking") {
        setThinking(true);
      } else if (data.type === "end") {
        if (data.content) {
          setMessages((m) => [...m, { role: "interviewer", content: data.content }]);
        }
        intentionalCloseRef.current = true;
        interviewActiveRef.current = false;
        setPhase("completed");
        ws.close();
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (data.type === "error") {
        intentionalCloseRef.current = true;
        interviewActiveRef.current = false;
        setError(data.content);
        setPhase("error");
        ws.close();
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };

    ws.onerror = () => {};

    ws.onclose = (event) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (intentionalCloseRef.current) return;
      if (event.code === 1000) return;
      if (!interviewActiveRef.current) return;

      const maxAttempts = 3;
      const delays = [1000, 2000, 4000];
      if (reconnectAttemptsRef.current >= maxAttempts) {
        interviewActiveRef.current = false;
        setReconnectFailed(true);
        setError("Connection lost. Please try again.");
        setPhase("error");
        return;
      }

      const delay = delays[reconnectAttemptsRef.current];
      reconnectAttemptsRef.current += 1;
      setReconnecting(true);
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectWebSocket();
      }, delay);
    };
  }, [token]);

  function startInterview() {
    setPhase("interview");
    interviewActiveRef.current = true;
    connectWebSocket();
  }

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, []);

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !wsRef.current || thinking) return;

    const text = input.trim();
    setMessages((m) => [...m, { role: "candidate", content: text }]);
    wsRef.current.send(JSON.stringify({ type: "message", content: text }));
    setInput("");
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }

  if (phase === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
          <h2 className="mt-4 text-xl font-bold text-white">
            Something went wrong
          </h2>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-slate-600 bg-slate-800 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "completed") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-400" />
          <h2 className="mt-4 text-xl font-bold text-white">
            Interview Complete
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Thank you for completing the interview! Your responses have been
            recorded and will be reviewed by the hiring team.
          </p>
          {elapsed > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Duration: {formatTime(elapsed)}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (phase === "consent") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">InterviewBot</h1>
              <p className="text-xs text-slate-400">AI-Powered Interview</p>
            </div>
          </div>

          <div className="mb-6 rounded-xl bg-slate-800/50 p-4">
            <h2 className="font-semibold text-white">{jobTitle}</h2>
            <p className="mt-1 text-sm text-slate-400 line-clamp-3">
              {jobDescription}
            </p>
          </div>

          <form onSubmit={handleConsent} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="jane@example.com"
              />
            </div>

            <div className="rounded-lg bg-slate-800/50 p-3 text-xs text-slate-400">
              <p className="font-medium text-slate-300 mb-1">
                Before you begin:
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>This is an AI-powered interview session</li>
                <li>Your responses will be recorded and analyzed</li>
                <li>Tab switches are monitored during the interview</li>
                <li>
                  Estimated duration:{" "}
                  {(interviewConfig as Record<string, number>)?.duration_minutes || 30}{" "}
                  minutes
                </li>
              </ul>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              I Agree &mdash; Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-indigo-400" />
          <h2 className="mt-4 text-xl font-bold text-white">Ready to Begin</h2>
          <p className="mt-2 text-sm text-slate-400">
            Click start when you&apos;re ready. The AI interviewer will ask you
            {" "}{total} questions about the role.
          </p>
          <button
            onClick={startInterview}
            className="mt-6 rounded-lg bg-indigo-600 px-8 py-3 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Start Interview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950">
      {reconnecting && (
        <div className="bg-amber-600/90 text-white text-center py-2 text-sm font-medium">
          Reconnecting...
        </div>
      )}
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">{jobTitle}</h1>
            <p className="text-xs text-slate-500">AI Interview</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            {formatTime(elapsed)}
          </div>
          <div className="text-xs text-slate-500">
            Q {progress}/{total}
          </div>
          {tabSwitches > 0 && (
            <div className="flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {tabSwitches} tab switch{tabSwitches > 1 ? "es" : ""}
            </div>
          )}
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-slate-800">
        <div
          className="h-full bg-indigo-600 transition-all duration-500"
          style={{ width: `${(progress / total) * 100}%` }}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                msg.role === "candidate" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                  msg.role === "candidate"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-slate-800 text-slate-200 rounded-bl-sm",
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {thinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-800 px-4 py-3 rounded-bl-sm">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 px-4 py-4">
        <form
          onSubmit={sendMessage}
          className="max-w-3xl mx-auto flex items-center gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={thinking}
            placeholder={thinking ? "Waiting for response..." : "Type your answer..."}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50"
            autoFocus
          />
          <button
            type="submit"
            disabled={thinking || !input.trim()}
            className="rounded-xl bg-indigo-600 p-3 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
