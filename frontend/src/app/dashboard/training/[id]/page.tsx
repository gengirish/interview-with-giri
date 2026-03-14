"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  Loader2,
  Send,
  StopCircle,
  User,
  Lightbulb,
  Award,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Simulation {
  id: string;
  role_type: string;
  candidate_persona: Record<string, unknown>;
  messages: Array<{ role: string; content: string }>;
  status: string;
  scorecard: Record<string, unknown> | null;
  duration_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
}

const DIMENSION_LABELS: Record<string, string> = {
  question_quality: "Question Quality",
  competency_coverage: "Competency Coverage",
  bias_avoidance: "Bias Avoidance",
  candidate_experience: "Candidate Experience",
  depth_vs_breadth: "Depth vs Breadth",
  time_management: "Time Management",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TrainingSimulationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [sim, setSim] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [input, setInput] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSim = useCallback(async () => {
    try {
      const data = await api.getTraining(id);
      setSim(data);
      if (data.started_at && data.status === "active") {
        const start = new Date(data.started_at).getTime();
        const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
        tick();
        timerRef.current = setInterval(tick, 1000);
      } else if (data.duration_seconds != null) {
        setElapsed(data.duration_seconds);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load simulation");
      router.push("/dashboard/training");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadSim();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadSim]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sim?.messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending || !sim || sim.status !== "active") return;

    setSending(true);
    setInput("");
    try {
      const { response } = await api.sendTrainingMessage(id, text);
      setSim((prev) =>
        prev
          ? {
              ...prev,
              messages: [
                ...prev.messages,
                { role: "interviewer", content: text },
                { role: "candidate", content: response },
              ],
            }
          : null
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function handleEnd() {
    if (ending || !sim || sim.status !== "active") return;

    setEnding(true);
    try {
      const updated = await api.endTraining(id);
      setSim((prev) => prev ? { ...prev, ...updated } : prev);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to end interview");
    } finally {
      setEnding(false);
    }
  }

  if (loading || !sim) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  const persona = sim.candidate_persona as {
    name?: string;
    experience_years?: number;
    skill_level?: string;
    personality?: string;
    background?: string;
  };
  const scorecard = sim.scorecard as {
    overall?: number;
    question_quality?: { score?: number; feedback?: string };
    competency_coverage?: { score?: number; feedback?: string };
    bias_avoidance?: { score?: number; feedback?: string };
    candidate_experience?: { score?: number; feedback?: string };
    depth_vs_breadth?: { score?: number; feedback?: string };
    time_management?: { score?: number; feedback?: string };
    tips?: string[];
  } | null;

  const isCompleted = sim.status === "completed";

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      { /* Header */ }
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/training"
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Interview Practice — {sim.role_type}
            </h1>
            <p className="text-xs text-slate-500">
              {!isCompleted ? formatDuration(elapsed) : sim.duration_seconds != null ? formatDuration(sim.duration_seconds) : "—"}
            </p>
          </div>
        </div>
        {!isCompleted && (
          <button
            onClick={handleEnd}
            disabled={ending}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
            End Interview
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        { /* Persona card (left) */ }
        <div className="hidden lg:block w-64 shrink-0 border-r border-slate-200 p-4">
          <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4">
            <div className="flex items-center gap-2 text-violet-700">
              <User className="h-5 w-5" />
              <span className="font-medium">{persona.name ?? "Candidate"}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {persona.experience_years ?? 0} years · {persona.skill_level ?? "mid"}
            </p>
            <p className="mt-1 text-sm text-slate-600">{persona.personality ?? ""}</p>
            <p className="mt-2 text-xs text-slate-500 line-clamp-3">{persona.background ?? ""}</p>
          </div>
        </div>

        { /* Chat (center) */ }
        <div className="flex flex-1 flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {sim.messages.length === 0 && (
              <p className="text-center text-sm text-slate-500 py-8">
                Start the interview by asking your first question.
              </p>
            )}
            {sim.messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "interviewer" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-4 py-2 text-sm",
                    m.role === "interviewer"
                      ? "bg-violet-600 text-white"
                      : "bg-slate-100 text-slate-900"
                  )}
                >
                  <p className="text-xs font-medium opacity-80 mb-0.5">
                    {m.role === "interviewer" ? "You" : persona.name ?? "Candidate"}
                  </p>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          { /* Input (bottom) */ }
          {!isCompleted && (
            <div className="border-t border-slate-200 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Ask your question..."
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      { /* Scorecard (after completion) */ }
      {isCompleted && scorecard && (
        <div className="border-t border-slate-200 p-6 space-y-6 overflow-y-auto max-h-96">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Award className="h-5 w-5 text-violet-600" />
            Your Scorecard
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-violet-600">
              {scorecard.overall != null ? scorecard.overall.toFixed(1) : "—"}
            </span>
            <span className="text-slate-500">/ 10 overall</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
              const dim = scorecard[key as keyof typeof scorecard];
              const d = typeof dim === "object" && dim && "score" in dim ? dim as { score?: number; feedback?: string } : null;
              if (!d) return null;
              return (
                <div
                  key={key}
                  className="rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{label}</span>
                    <span className="text-violet-600 font-semibold">{d.score ?? "—"}/10</span>
                  </div>
                  {d.feedback && (
                    <p className="mt-2 text-sm text-slate-600">{d.feedback}</p>
                  )}
                </div>
              );
            })}
          </div>
          {scorecard.tips && scorecard.tips.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                Tips for improvement
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-slate-600">
                {scorecard.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ol>
            </div>
          )}
          <Link
            href="/dashboard/training"
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            Try Again
          </Link>
        </div>
      )}
    </div>
  );
}
