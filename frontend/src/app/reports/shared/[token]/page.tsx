"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, type CandidateReport } from "@/lib/api";
import {
  Award,
  Check,
  X,
  FileText,
  Loader2,
  Sparkles,
  Code2,
  Cpu,
  LayoutGrid,
  Lock,
  TestTube,
  Mic,
  Target,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { LazyRadarChart } from "@/components/lazy-charts";

const TECHNICAL_DIMENSION_KEYS = [
  "code_quality",
  "problem_solving",
  "system_design",
  "security_awareness",
  "testing_instinct",
  "technical_communication",
] as const;

const TECHNICAL_DIMENSION_LABELS: Record<string, string> = {
  code_quality: "Code Quality",
  problem_solving: "Problem Solving",
  system_design: "System Design",
  security_awareness: "Security",
  testing_instinct: "Testing",
  technical_communication: "Communication",
};

interface ScoreEntry {
  score: number | null;
  evidence: string;
  notes?: string;
}

function getScore(report: CandidateReport, key: string): ScoreEntry | undefined {
  const skill = report.skill_scores[key];
  const behavioral = report.behavioral_scores[key];
  const entry = skill ?? behavioral;
  if (!entry) return undefined;
  return {
    score: entry.score,
    evidence: entry.evidence,
    notes: "notes" in entry ? (entry as { notes?: string }).notes : undefined,
  };
}

function getAllDimensions(report: CandidateReport) {
  const technical: Record<string, ScoreEntry> = {};
  const behavioral: Record<string, ScoreEntry> = {};
  for (const [k, v] of Object.entries(report.skill_scores)) {
    technical[k] = {
      score: v.score,
      evidence: v.evidence,
      notes: "notes" in v ? (v as { notes?: string }).notes : undefined,
    };
  }
  for (const [k, v] of Object.entries(report.behavioral_scores)) {
    behavioral[k] = {
      score: v.score,
      evidence: v.evidence,
      notes: "notes" in v ? (v as { notes?: string }).notes : undefined,
    };
  }
  return { technical, behavioral };
}

function scoreColor(score: number): string {
  if (score >= 7) return "text-emerald-600";
  if (score >= 5) return "text-amber-600";
  return "text-red-600";
}

function scoreBarColor(score: number): string {
  if (score >= 7) return "bg-emerald-500";
  if (score >= 5) return "bg-amber-500";
  return "bg-red-500";
}

function recommendationStyle(rec: string | null) {
  if (!rec) return "bg-slate-100 text-slate-600";
  if (rec === "strong_hire") return "bg-emerald-100 text-emerald-800";
  if (rec === "hire") return "bg-emerald-100 text-emerald-700";
  if (rec === "lean_no_hire") return "bg-amber-100 text-amber-800";
  if (rec === "no_hire") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-600";
}

function recommendationLabel(rec: string | null) {
  if (!rec) return "Pending";
  const labels: Record<string, string> = {
    strong_hire: "Strong Hire",
    hire: "Hire",
    lean_no_hire: "Lean No Hire",
    no_hire: "No Hire",
  };
  return labels[rec] ?? rec.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const dimensionIcons: Record<string, React.ReactNode> = {
  code_quality: <Code2 className="h-4 w-4" />,
  problem_solving: <Cpu className="h-4 w-4" />,
  system_design: <LayoutGrid className="h-4 w-4" />,
  security_awareness: <Lock className="h-4 w-4" />,
  testing_instinct: <TestTube className="h-4 w-4" />,
  technical_communication: <Mic className="h-4 w-4" />,
};

export default function SharedReportPage() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<CandidateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"not_found" | "expired" | null>(null);

  useEffect(() => {
    if (!token) return;
    async function load() {
      try {
        const r = await api.getPublicReport(token);
        setReport(r);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 410) setError("expired");
          else setError("not_found");
        } else {
          setError("not_found");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          <p className="text-sm text-slate-500">Loading report…</p>
        </div>
      </div>
    );
  }

  if (error === "expired") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <FileText className="mx-auto h-12 w-12 text-amber-400" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">
            This shared link has expired
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Shared report links expire after a set time for security. Please ask the hiring manager
            for a new link if you need access.
          </p>
        </div>
      </div>
    );
  }

  if (error === "not_found" || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <FileText className="mx-auto h-12 w-12 text-slate-300" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">Report not found</h1>
          <p className="mt-2 text-sm text-slate-600">
            This link may be invalid or the report may have been removed.
          </p>
        </div>
      </div>
    );
  }

  const hasDimensionalData =
    Object.keys(report.skill_scores).length > 0 ||
    Object.keys(report.behavioral_scores).length > 0;

  const radarData = hasDimensionalData
    ? (() => {
        const dims = new Map<string, { technical: number; behavioral: number }>();
        for (const key of TECHNICAL_DIMENSION_KEYS) {
          const entry = getScore(report, key) ?? report.skill_scores[key];
          const score = entry && "score" in entry ? (entry as ScoreEntry).score : null;
          const label =
            TECHNICAL_DIMENSION_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          dims.set(label, { technical: score ?? 0, behavioral: 0 });
        }
        for (const [key, entry] of Object.entries(report.behavioral_scores)) {
          const label =
            TECHNICAL_DIMENSION_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          const existing = dims.get(label);
          const score = entry?.score ?? 0;
          if (existing) existing.behavioral = score;
          else dims.set(label, { technical: 0, behavioral: score });
        }
        return Array.from(dims.entries()).map(([dimension, { technical, behavioral }]) => ({
          dimension,
          technical,
          behavioral,
          fullMark: 10,
        }));
      })()
    : [];

  const { technical, behavioral } = getAllDimensions(report);
  const allDimensionEntries = [
    ...Object.entries(technical).map(([k, v]) => ({ key: k, ...v, type: "technical" as const })),
    ...Object.entries(behavioral).map(([k, v]) => ({ key: k, ...v, type: "behavioral" as const })),
  ];

  const overallScore = report.overall_score ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Shared Interview Report</h1>
          {report.candidate_name && (
            <p className="mt-1 text-sm text-slate-500">Candidate: {report.candidate_name}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {overallScore != null && (
              <div className="relative flex h-14 w-14 items-center justify-center">
                <svg className="h-14 w-14 -rotate-90" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-slate-200"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    strokeWidth="2.5"
                    strokeDasharray={`${(overallScore / 10) * 100}, 100`}
                    strokeLinecap="round"
                    className={cn(
                      overallScore >= 7 ? "text-emerald-500" : overallScore >= 5 ? "text-amber-500" : "text-red-500",
                    )}
                  />
                </svg>
                <span className="absolute text-base font-bold text-slate-900">
                  {overallScore.toFixed(1)}
                </span>
              </div>
            )}
            {report.recommendation && (
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium",
                  recommendationStyle(report.recommendation),
                )}
              >
                {recommendationLabel(report.recommendation)}
              </span>
            )}
          </div>
        </div>

        {/* Radar Chart */}
        {hasDimensionalData && radarData.length > 0 && (
          <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Dimensional Score Overview</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LazyRadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 10]} />
                  <Radar
                    name="Technical"
                    dataKey="technical"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                  {radarData.some((d) => d.behavioral > 0) && (
                    <Radar
                      name="Behavioral"
                      dataKey="behavioral"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  )}
                  <Legend />
                </LazyRadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Dimensional Breakdown */}
        {allDimensionEntries.length > 0 && (
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {allDimensionEntries.map(({ key, score, evidence, notes, type }) => {
              const label =
                TECHNICAL_DIMENSION_LABELS[key] ??
                key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
              const icon = dimensionIcons[key] ?? <Award className="h-4 w-4" />;
              const numScore = score ?? 0;
              return (
                <div
                  key={`${type}-${key}`}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-600">{icon}</span>
                    <span className="text-sm font-semibold text-slate-900">{label}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="mr-2 h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn("h-full rounded-full transition-all", scoreBarColor(numScore))}
                        style={{ width: `${Math.min(100, (numScore / 10) * 100)}%` }}
                      />
                    </div>
                    <span className={cn("shrink-0 text-sm font-bold", scoreColor(numScore))}>
                      {numScore.toFixed(1)}
                    </span>
                  </div>
                  {evidence && (
                    <blockquote className="mt-2 border-l-2 border-slate-200 pl-3 text-xs italic text-slate-600">
                      &ldquo;{evidence}&rdquo;
                    </blockquote>
                  )}
                  {notes && <p className="mt-1 text-xs text-slate-500">{notes}</p>}
                </div>
              );
            })}
          </div>
        )}

        {/* Executive Summary */}
        {(report.ai_summary ?? report.summary) && (
          <div className="mb-8 rounded-xl border border-indigo-100 bg-indigo-50/30 p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              Executive Summary
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {report.ai_summary ?? report.summary}
            </p>
          </div>
        )}

        {/* Strengths & Concerns */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <Check className="h-4 w-4 text-emerald-500" />
              Strengths
            </h3>
            <ul className="mt-3 space-y-2">
              {report.strengths.length > 0 ? (
                report.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    {s}
                  </li>
                ))
              ) : (
                <li className="text-sm text-slate-500">No strengths recorded.</li>
              )}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800">
              <X className="h-4 w-4 text-red-500" />
              Concerns
            </h3>
            <ul className="mt-3 space-y-2">
              {report.concerns.length > 0 ? (
                report.concerns.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    {c}
                  </li>
                ))
              ) : (
                <li className="text-sm text-slate-500">No concerns recorded.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Hiring Level Fit & Follow-up */}
        {(report.hiring_level_fit || (report.suggested_follow_up_areas?.length ?? 0) > 0) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {report.hiring_level_fit && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Target className="h-4 w-4 text-indigo-600" />
                  Hiring Level Fit
                </h3>
                <p className="mt-2 text-sm text-slate-700">{report.hiring_level_fit}</p>
              </div>
            )}
            {(report.suggested_follow_up_areas?.length ?? 0) > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ClipboardList className="h-4 w-4 text-indigo-600" />
                  Suggested Follow-up Areas
                </h3>
                <ul className="mt-2 space-y-1">
                  {report.suggested_follow_up_areas!.map((area, i) => (
                    <li key={i} className="text-sm text-slate-700">
                      &bull; {area}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!hasDimensionalData && !report.ai_summary && !report.summary && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-700">
              No detailed breakdown available for this report.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
