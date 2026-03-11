"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
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
import { CodeEditor } from "@/components/code-editor";

type Phase = "loading" | "consent" | "ready" | "interview" | "completed" | "error";
type ChatMessage = { role: "interviewer" | "candidate"; content: string };

export default function CodeInterviewPage() {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
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

  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        setProgress(data.progress || 0);
        setTotal(data.total || 10);
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
    setActiveTab("chat");
  }

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
          <h2 className="mt-4 text-xl font-bold text-white">Error</h2>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
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

  return (
    <div className="flex h-screen flex-col bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Code2 className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-sm font-semibold text-white">{jobTitle}</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg border border-slate-700 overflow-hidden">
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

      <div className="h-1 bg-slate-800">
        <div
          className="h-full bg-indigo-600 transition-all duration-500"
          style={{ width: `${(progress / total) * 100}%` }}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "chat" ? (
          <div className="flex h-full flex-col">
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
                        "max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap",
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
                        <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" />
                        <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

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
                  placeholder={thinking ? "Waiting..." : "Type your answer or explain your code..."}
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
        ) : (
          <div className="h-full p-4">
            <CodeEditor
              onSubmit={(code) => handleCodeSubmit(code)}
              className="h-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}
