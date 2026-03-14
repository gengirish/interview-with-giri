"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  GraduationCap,
  Loader2,
  Play,
  TrendingUp,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Persona {
  name: string;
  experience_years: number;
  skill_level: string;
  personality: string;
  hidden_strengths: string[];
  hidden_weaknesses: string[];
  background: string;
}

interface HistoryItem {
  id: string;
  role_type: string;
  status: string;
  scorecard: { overall?: number } | null;
  duration_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
}

interface LeaderboardItem {
  user_id: string;
  full_name: string;
  email: string;
  avg_score: number;
  simulations_count: number;
}

const ROLE_TYPES = [
  "Software Engineer",
  "Product Manager",
  "Data Scientist",
  "Technical Lead",
  "Engineering Manager",
];

const SKILL_LEVEL_BADGE: Record<string, string> = {
  junior: "bg-amber-100 text-amber-800",
  mid: "bg-blue-100 text-blue-800",
  senior: "bg-emerald-100 text-emerald-800",
  principal: "bg-purple-100 text-purple-800",
};

export default function TrainingPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [roleType, setRoleType] = useState(ROLE_TYPES[0]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [personasRes, historyRes, leaderboardRes] = await Promise.all([
        api.getTrainingPersonas(),
        api.getTrainingHistory(),
        api.getTrainingLeaderboard(),
      ]);
      setPersonas(personasRes);
      setHistory(historyRes);
      setLeaderboard(leaderboardRes);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load training data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleStart() {
    setStarting(true);
    try {
      const sim = await api.startTraining({
        role_type: roleType,
        persona: selectedPersona ? (selectedPersona as unknown as Record<string, unknown>) : undefined,
      });
      window.location.href = `/dashboard/training/${sim.id}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start simulation");
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      { /* Hero */ }
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-violet-600" />
          Practice Your Interview Skills
        </h1>
        <p className="mt-2 text-slate-600 max-w-2xl">
          Train with AI-simulated candidates. The AI plays the candidate role with configurable skill levels
          and personalities, then scores you on question quality, competency coverage, bias avoidance,
          and candidate experience.
        </p>
      </div>

      { /* Start Simulation */ }
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Play className="h-4 w-4 text-violet-600" />
          Start Simulation
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role type</label>
            <select
              value={roleType}
              onChange={(e) => setRoleType(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            >
              {ROLE_TYPES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Candidate persona</label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {personas.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setSelectedPersona(selectedPersona?.name === p.name ? null : p)}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    selectedPersona?.name === p.name
                      ? "border-violet-500 bg-violet-50 ring-2 ring-violet-500"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">{p.name}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        SKILL_LEVEL_BADGE[p.skill_level] ?? "bg-slate-100 text-slate-600"
                      )}
                    >
                      {p.skill_level}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {p.experience_years}yr · {p.personality}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2">{p.background}</p>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {selectedPersona
                ? `Selected: ${selectedPersona.name}`
                : "No selection = random persona"}
            </p>
          </div>
          <button
            onClick={handleStart}
            disabled={starting}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Start
          </button>
        </div>
      </div>

      { /* History */ }
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-violet-600" />
          History
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No simulations yet. Start one above.</p>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 10).map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/training/${item.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700">{item.role_type}</span>
                  <span className="text-xs text-slate-500">
                    {item.started_at ? new Date(item.started_at).toLocaleDateString() : "—"}
                  </span>
                  {item.scorecard?.overall != null && (
                    <span className="text-sm font-medium text-violet-600">
                      {item.scorecard.overall.toFixed(1)}/10
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    item.status === "active" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                  )}
                >
                  {item.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      { /* Leaderboard */ }
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-violet-600" />
          Leaderboard
        </h2>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-slate-500">No completed simulations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-2 text-left font-medium text-slate-600">Rank</th>
                  <th className="pb-2 text-left font-medium text-slate-600">Name</th>
                  <th className="pb-2 text-left font-medium text-slate-600">Avg score</th>
                  <th className="pb-2 text-left font-medium text-slate-600">Simulations</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, i) => (
                  <tr key={row.user_id} className="border-b border-slate-100">
                    <td className="py-3">{i + 1}</td>
                    <td className="py-3 font-medium text-slate-900">{row.full_name}</td>
                    <td className="py-3 text-violet-600 font-medium">{row.avg_score.toFixed(1)}</td>
                    <td className="py-3 text-slate-600">{row.simulations_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
