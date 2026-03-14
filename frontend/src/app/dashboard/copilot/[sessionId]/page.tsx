"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  type CopilotSession,
  type CopilotSuggestion,
  type InterviewMessage,
} from "@/lib/api";
import {
  Loader2,
  Sparkles,
  Target,
  AlertTriangle,
  Copy,
  ArrowLeft,
  LogOut,
  Check,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function CoverageBar({ covered, depth }: { covered: boolean; depth: number }) {
  const pct = covered ? Math.min(100, (depth / 3) * 100) : 0;
  const color = covered
    ? depth >= 2
      ? "bg-emerald-500"
      : "bg-amber-500"
    : "bg-red-400";
  return (
    <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function CopilotPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params?.sessionId;

  const [copilot, setCopilot] = useState<CopilotSession | null>(null);
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [coverage, setCoverage] = useState<
    Record<string, { covered: boolean; depth: number }>
  >({});
  const [suggestions, setSuggestions] = useState<CopilotSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!sessionId) return;
    try {
      const msgs = await api.getInterviewMessages(sessionId);
      setMessages(msgs);
    } catch {
      setMessages([]);
    }
  }, [sessionId]);

  const loadCoverage = useCallback(async () => {
    if (!copilot?.id) return;
    try {
      const res = await api.getCopilotCoverage(copilot.id);
      setCoverage(res.coverage || {});
    } catch {
      setCoverage({});
    }
  }, [copilot?.id]);

  useEffect(() => {
    if (!sessionId) return;
    let mounted = true;
    setLoading(true);
    api
      .startCopilot(sessionId)
      .then((c) => {
        if (mounted) setCopilot(c);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to start copilot");
        if (mounted) router.push("/dashboard/interviews");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [sessionId, router]);

  useEffect(() => {
    if (copilot) {
      loadMessages();
      loadCoverage();
    }
  }, [copilot, loadMessages, loadCoverage]);

  useEffect(() => {
    if (!copilot?.id) return;
    const interval = setInterval(loadMessages, 8000);
    return () => clearInterval(interval);
  }, [copilot?.id, loadMessages]);

  useEffect(() => {
    if (copilot?.suggestions?.length) {
      setSuggestions(copilot.suggestions);
    }
  }, [copilot?.suggestions]);

  useEffect(() => {
    if (copilot?.competency_coverage && Object.keys(copilot.competency_coverage).length > 0) {
      setCoverage(copilot.competency_coverage);
    }
  }, [copilot?.competency_coverage]);

  async function handleGetSuggestions() {
    if (!copilot?.id) return;
    setSuggesting(true);
    try {
      const res = await api.getCopilotSuggestions(copilot.id);
      setSuggestions((prev) => [...prev, ...res.suggestions]);
      await loadCoverage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get suggestions");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleEndSession() {
    if (!copilot?.id) return;
    setEnding(true);
    try {
      await api.endCopilot(copilot.id);
      toast.success("Copilot session ended");
      router.push("/dashboard/interviews");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to end session");
    } finally {
      setEnding(false);
    }
  }

  function handleCopyQuestion(question: string, id: string) {
    navigator.clipboard.writeText(question);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 1500);
  }

  const legalAlerts = copilot?.legal_alerts ?? [];
  const coverageData = Object.keys(coverage).length > 0 ? coverage : copilot?.competency_coverage ?? {};

  if (loading || !sessionId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!copilot) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/interviews"
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 transition-colors"
            aria-label="Back to interviews"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">AI Interview Co-Pilot</h1>
            <p className="text-sm text-slate-500">
              Real-time suggestions and competency tracking
            </p>
          </div>
        </div>
        <button
          onClick={handleEndSession}
          disabled={ending || copilot.status === "ended"}
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          {ending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          End Session
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Transcript */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">Live Transcript</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {messages.length} messages
            </p>
          </div>
          <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-100">
            {messages.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-500">
                No messages yet. The transcript will update as the interview progresses.
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "px-6 py-4",
                    msg.role === "interviewer" ? "bg-slate-50/50" : ""
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wider",
                        msg.role === "interviewer" ? "text-indigo-600" : "text-slate-600"
                      )}
                    >
                      {msg.role === "interviewer" ? "AI Interviewer" : "Candidate"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.content}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Copilot Sidebar */}
        <div className="space-y-4">
          {/* Get Suggestions */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Follow-up Suggestions
            </h3>
            <button
              onClick={handleGetSuggestions}
              disabled={suggesting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {suggesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Get Suggestions
            </button>

            {suggestions.length > 0 && (
              <div className="mt-4 space-y-3">
                {suggestions.map((s, i) => (
                  <div
                    key={`${i}-${s.question.slice(0, 20)}`}
                    className="rounded-lg border border-slate-200 bg-slate-50/50 p-3"
                  >
                    <p className="text-sm font-medium text-slate-900">{s.question}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                        {s.targets_skill}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                          s.difficulty === "easy" && "bg-emerald-100 text-emerald-800",
                          s.difficulty === "medium" && "bg-amber-100 text-amber-800",
                          s.difficulty === "hard" && "bg-red-100 text-red-800",
                          !["easy", "medium", "hard"].includes(s.difficulty) &&
                            "bg-slate-100 text-slate-700"
                        )}
                      >
                        {s.difficulty}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600">{s.rationale}</p>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyQuestion(s.question, `s-${i}`)
                      }
                      className="mt-2 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      {copiedId === `s-${i}` ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Competency Coverage */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-600" />
              Competency Coverage
            </h3>
            {Object.keys(coverageData).length === 0 ? (
              <p className="text-xs text-slate-500">
                Load coverage or get suggestions to see competency tracking.
              </p>
            ) : (
              <div className="space-y-2">
                {Object.entries(coverageData).map(([skill, data]) => (
                  <div key={skill}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-medium text-slate-700">{skill}</span>
                      <span
                        className={cn(
                          data.covered ? "text-emerald-600" : "text-red-600"
                        )}
                      >
                        {data.covered ? `Depth ${data.depth}` : "Uncovered"}
                      </span>
                    </div>
                    <CoverageBar covered={data.covered} depth={data.depth} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Legal Alerts */}
          {legalAlerts.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Legal / Bias Alerts
              </h3>
              <div className="space-y-2">
                {legalAlerts.map((alert, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-red-200 bg-white p-2 text-sm"
                  >
                    <p className="text-slate-700">&ldquo;{alert.question}&rdquo;</p>
                    <p className="mt-1 text-xs text-red-700">
                      {alert.risk_type} · {alert.severity}
                      {alert.suggestion && ` — ${alert.suggestion}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
