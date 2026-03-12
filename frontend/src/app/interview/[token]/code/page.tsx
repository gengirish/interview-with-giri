"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { BehaviorEvent } from "@/lib/api";
import {
  Send,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  Code2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InterviewPhase } from "@/lib/types";
import { CodeEditor } from "@/components/code-editor";

const BATCH_INTERVAL_MS = 10_000;
const IDLE_THRESHOLD_MS = 30_000;

type ChatMessage = {
  role: "interviewer" | "candidate";
  content: string;
  isCodeReview?: boolean;
};

export default function CodeInterviewPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [phase, setPhase] = useState<InterviewPhase>("loading");
  const [jobTitle, setJobTitle] = useState("");
  const [error, setError] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(10);
  const [elapsed, setElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState<"chat" | "code">("chat");
  const [chatPulse, setChatPulse] = useState(false);
  const [lastMessageWasCodeSubmit, setLastMessageWasCodeSubmit] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const behaviorBufferRef = useRef<BehaviorEvent[]>([]);
  const batchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveTabRef = useRef<"chat" | "code">("chat");
  const tokenRef = useRef(token);

  tokenRef.current = token;

  const flushBehaviorEvents = useCallback(async () => {
    const events = behaviorBufferRef.current;
    if (events.length === 0 || !tokenRef.current) return;
    behaviorBufferRef.current = [];
    try {
      await api.submitBehaviorEvents(tokenRef.current, events);
    } catch {
      behaviorBufferRef.current = [...events];
    }
  }, []);

  const pushBehaviorEvent = useCallback((event: BehaviorEvent) => {
    behaviorBufferRef.current.push(event);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getPublicInterview(token);
        if (data.status === "completed") {
          setPhase("completed");
          return;
        }
        setJobTitle(data.job_title as string || "");
        setTotal((data.interview_config as Record<string, number>)?.num_questions || 10);
        setPhase("consent");
      } catch {
        setError("Interview not found.");
        setPhase("error");
      }
    }
    load();
  }, [token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (phase !== "interview") return;
    batchIntervalRef.current = setInterval(
      flushBehaviorEvents,
      BATCH_INTERVAL_MS
    );
    return () => {
      if (batchIntervalRef.current) {
        clearInterval(batchIntervalRef.current);
        batchIntervalRef.current = null;
      }
    };
  }, [phase, flushBehaviorEvents]);

  useEffect(() => {
    if (phase !== "interview") return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pushBehaviorEvent({
          event_type: "focus_loss",
          timestamp: new Date().toISOString(),
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [phase, pushBehaviorEvent]);

  useEffect(() => {
    if (phase !== "interview") return;
    const resetIdleTimer = () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
      idleTimeoutRef.current = setTimeout(() => {
        pushBehaviorEvent({
          event_type: "idle",
          timestamp: new Date().toISOString(),
          data: { duration_ms: IDLE_THRESHOLD_MS },
        });
        idleTimeoutRef.current = null;
      }, IDLE_THRESHOLD_MS);
    };
    resetIdleTimer();
    const events = ["keydown", "mousedown", "scroll", "click"];
    events.forEach((e) => document.addEventListener(e, resetIdleTimer));
    return () => {
      events.forEach((e) => document.removeEventListener(e, resetIdleTimer));
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, [phase, pushBehaviorEvent]);

  useEffect(() => {
    if (phase !== "interview") return;
    if (prevActiveTabRef.current !== activeTab) {
      pushBehaviorEvent({
        event_type: "tab_switch",
        timestamp: new Date().toISOString(),
        data: { from: prevActiveTabRef.current, to: activeTab },
      });
      prevActiveTabRef.current = activeTab;
    }
  }, [phase, activeTab, pushBehaviorEvent]);

  useEffect(() => {
    if (phase === "completed") {
      flushBehaviorEvents();
    }
  }, [phase, flushBehaviorEvents]);

  async function handleConsent(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.startInterview(token, {
        candidate_name: candidateName,
        candidate_email: candidateEmail,
      });
      setPhase("ready");
    } catch {
      setError("Failed to start.");
      setPhase("error");
    }
  }

  const connectWebSocket = useCallback(() => {
    const wsUrl =
      (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8001") +
      `/ws/interview/${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "question") {
        setMessages((m) => [...m, { role: "interviewer", content: data.content }]);
        setThinking(false);
        setLastMessageWasCodeSubmit(false);
        setProgress(data.progress ?? 0);
        setTotal(data.total ?? 10);
      } else if (data.type === "code_review") {
        setMessages((m) => [
          ...m,
          { role: "interviewer", content: data.content, isCodeReview: true },
        ]);
        setThinking(false);
        setLastMessageWasCodeSubmit(false);
        setChatPulse(true);
        setTimeout(() => setChatPulse(false), 1500);
      } else if (data.type === "thinking") {
        setThinking(true);
      } else if (data.type === "end") {
        if (data.content) {
          setMessages((m) => [...m, { role: "interviewer", content: data.content }]);
        }
        setPhase("completed");
        ws.close();
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (data.type === "error") {
        setError(data.content);
        setPhase("error");
      }
    };
    ws.onerror = () => {
      setError("Connection error.");
      setPhase("error");
    };
    ws.onclose = () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token]);

  function startInterview() {
    setPhase("interview");
    connectWebSocket();
  }

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !wsRef.current || thinking) return;
    const text = input.trim();
    setMessages((m) => [...m, { role: "candidate", content: text }]);
    wsRef.current.send(JSON.stringify({ type: "message", content: text }));
    setInput("");
  }

  function handleCodeSubmit(code: string) {
    if (!wsRef.current || thinking) return;
    const msg = `[Code Submission]\n\`\`\`\n${code}\n\`\`\``;
    setMessages((m) => [...m, { role: "candidate", content: msg }]);
    wsRef.current.send(JSON.stringify({ type: "message", content: msg }));
    setLastMessageWasCodeSubmit(true);
    setActiveTab("chat");
    setChatPulse(true);
    setTimeout(() => setChatPulse(false), 1500);
  }

  const handleBehaviorEvent = useCallback((event: BehaviorEvent) => {
    behaviorBufferRef.current.push(event);
  }, []);

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }

  if (phase === "loading")
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
      </div>
    );

  if (phase === "error")
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
          <h2 className="mt-4 text-xl font-bold text-white">Something went wrong</h2>
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

  if (phase === "completed")
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-400" />
          <h2 className="mt-4 text-xl font-bold text-white">Interview Complete</h2>
          <p className="mt-2 text-sm text-slate-400">
            Thank you! Your code and responses have been recorded.
          </p>
        </div>
      </div>
    );

  if (phase === "consent")
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Code2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Coding Interview</h1>
              <p className="text-xs text-slate-400">{jobTitle}</p>
            </div>
          </div>
          <form onSubmit={handleConsent} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                required
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div className="rounded-lg bg-slate-800/50 p-3 text-xs text-slate-400">
              <p className="font-medium text-slate-300 mb-1">About this interview:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Includes coding challenges with a built-in editor</li>
                <li>You can run your code against test cases</li>
                <li>Discuss your approach in the chat</li>
              </ul>
            </div>
            <button type="submit" className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
              Continue
            </button>
          </form>
        </div>
      </div>
    );

  if (phase === "ready")
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
          <Code2 className="mx-auto h-12 w-12 text-indigo-400" />
          <h2 className="mt-4 text-xl font-bold text-white">Ready</h2>
          <p className="mt-2 text-sm text-slate-400">
            You&apos;ll get coding problems along with discussion questions.
          </p>
          <button
            onClick={startInterview}
            className="mt-6 rounded-lg bg-indigo-600 px-8 py-3 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Start Coding Interview
          </button>
        </div>
      </div>
    );

  const lastMsgIsCodeSubmit =
    lastMessageWasCodeSubmit &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === "candidate" &&
    messages[messages.length - 1]?.content.includes("[Code Submission]");

  const renderChatMessage = (msg: ChatMessage) => {
    const isCodeBlock = msg.content.includes("```");
    return (
      <div
        className={cn(
          "flex",
          msg.role === "candidate" ? "justify-end" : "justify-start",
        )}
      >
        <div
          className={cn(
            "max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap",
            msg.role === "candidate"
              ? "bg-indigo-600 text-white rounded-br-sm"
              : "bg-slate-800 text-slate-200 rounded-bl-sm",
            msg.isCodeReview &&
              "border-l-2 border-indigo-400",
          )}
        >
          {msg.isCodeReview && (
            <span className="mb-2 block text-xs font-medium text-indigo-400">
              Code Review
            </span>
          )}
          {isCodeBlock ? (
            <pre className="overflow-x-auto text-left font-mono text-xs">
              {msg.content}
            </pre>
          ) : (
            msg.content
          )}
        </div>
      </div>
    );
  };

  const chatPanel = (
    <div
      className={cn(
        "flex h-full flex-col border-r border-slate-800",
        chatPulse && "animate-pulse",
      )}
    >
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        <div className="max-w-full space-y-4 lg:max-w-none">
          {messages.map((msg, i) => (
            <div key={i}>{renderChatMessage(msg)}</div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-800 px-4 py-3 rounded-bl-sm">
                {lastMsgIsCodeSubmit ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" />
                      <div
                        className="h-2 w-2 rounded-full bg-slate-500 animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="h-2 w-2 rounded-full bg-slate-500 animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                    AI is reviewing your code...
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" />
                    <div
                      className="h-2 w-2 rounded-full bg-slate-500 animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="h-2 w-2 rounded-full bg-slate-500 animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-800 px-4 py-4">
        <form
          onSubmit={sendMessage}
          className="flex items-center gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={thinking}
            placeholder={
              thinking
                ? "Waiting..."
                : "Type your answer or explain your code..."
            }
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 outline-none disabled:opacity-50"
            autoFocus
          />
          <button
            type="submit"
            disabled={thinking || !input.trim()}
            className="rounded-xl bg-indigo-600 p-3 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );

  const codePanel = (
    <div className="flex h-full min-h-0 flex-col p-4">
      <CodeEditor
        interviewToken={token}
        onSubmitCode={handleCodeSubmit}
        onBehaviorEvent={handleBehaviorEvent}
        className="h-full min-h-0 flex-1"
      />
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-slate-950">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Code2 className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-sm font-semibold text-white">{jobTitle}</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex lg:hidden rounded-lg border border-slate-700 overflow-hidden">
            <button
              onClick={() => setActiveTab("chat")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === "chat"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white",
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === "code"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white",
              )}
            >
              <Code2 className="h-3.5 w-3.5" />
              Code
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            {formatTime(elapsed)}
          </div>
          <div className="text-xs text-slate-500">
            Q {progress}/{total}
          </div>
        </div>
      </header>

      <div className="h-1 w-full bg-slate-800">
        <div
          className="h-full bg-indigo-600 transition-all duration-500"
          style={{ width: `${(progress / total) * 100}%` }}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[40%_1fr] h-full">
          <div
            className={cn(
              "min-w-0 overflow-hidden",
              activeTab !== "chat" && "hidden lg:block",
            )}
          >
            {chatPanel}
          </div>
          <div
            className={cn(
              "min-w-0 overflow-hidden",
              activeTab !== "code" && "hidden lg:block",
            )}
          >
            {codePanel}
          </div>
        </div>
      </div>
    </div>
  );
}
