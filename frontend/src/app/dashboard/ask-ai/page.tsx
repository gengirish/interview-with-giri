"use client";

import { useState, useRef, useEffect } from "react";
import { api, type JobPosting } from "@/lib/api";
import { Sparkles, Send, Loader2, ChevronDown } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{
    session_id: string;
    candidate_name: string | null;
    content_snippet: string;
    source_type: string;
  }>;
  sessions_searched?: number;
};

export default function AskAIPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showJobFilter, setShowJobFilter] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getJobPostings(1).then((res) => setJobs(res.items));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    setMessages((m) => [...m, { role: "user", content: query }]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.askAI(query, selectedJobId ?? undefined);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.answer,
          citations: res.citations,
          sessions_searched: res.sessions_searched,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Sorry, I couldn't process your question. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-600/20 p-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Ask AI</h1>
            <p className="text-xs text-slate-400">
              Search across all your interview data
            </p>
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowJobFilter((s) => !s)}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {selectedJobId
              ? jobs.find((j) => j.id === selectedJobId)?.title ?? "Filter by job"
              : "All jobs"}
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", showJobFilter && "rotate-180")}
            />
          </button>
          {showJobFilter && (
            <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl z-10">
              <button
                type="button"
                onClick={() => {
                  setSelectedJobId(null);
                  setShowJobFilter(false);
                }}
                className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
              >
                All jobs
              </button>
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => {
                    setSelectedJobId(job.id);
                    setShowJobFilter(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 truncate"
                >
                  {job.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles className="h-12 w-12 text-slate-600 mb-4" />
            <p className="text-slate-400 text-sm max-w-md">
              Ask questions about your interviews. For example: &quot;Who scored
              highest on problem solving?&quot; or &quot;Summarize concerns about
              the last 5 candidates.&quot;
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3",
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-sm",
              )}
            >
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              {msg.role === "assistant" && msg.sessions_searched != null && (
                <p className="mt-2 text-xs text-slate-500">
                  Searched {msg.sessions_searched} interview
                  {msg.sessions_searched !== 1 ? "s" : ""}
                </p>
              )}
              {msg.role === "assistant" &&
                msg.citations &&
                msg.citations.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-slate-400">
                      Sources
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {msg.citations.map((c) => (
                        <Link
                          key={c.session_id}
                          href={`/dashboard/interviews/${c.session_id}`}
                          className="inline-flex flex-col rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-left hover:bg-slate-800 transition-colors max-w-[200px]"
                        >
                          <span className="text-xs font-medium text-indigo-400 truncate">
                            {c.candidate_name ?? "Unknown"}
                          </span>
                          <span className="text-xs text-slate-500 truncate mt-0.5">
                            {c.content_snippet}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-900 border border-slate-800 px-4 py-3 rounded-bl-sm">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-800 px-6 py-4"
      >
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder={
              loading ? "Thinking..." : "Ask about your interviews..."
            }
            className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl p-3 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            aria-label="Send"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
