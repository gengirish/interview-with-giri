"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type JobPosting } from "@/lib/api";
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileText,
  Filter,
  Loader2,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWalkthrough } from "@/hooks/use-walkthrough";

type CompareCandidate = {
  session_id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  overall_score: number | null;
  duration_seconds: number | null;
  completed_at: string | null;
  is_shortlisted: boolean;
  skill_scores: Record<string, { score: number | null; evidence: string }>;
  behavioral_scores: Record<string, { score: number | null; evidence: string }>;
  recommendation: string | null;
  confidence_score: number | null;
  strengths: string[];
  concerns: string[];
  ai_summary: string | null;
};

type SortKey =
  | "candidate_name"
  | "overall_score"
  | "recommendation"
  | "confidence_score"
  | "duration_seconds"
  | "is_shortlisted"
  | "completed_at";
type SortDir = "asc" | "desc";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRecommendation(rec: string | null): string {
  if (!rec) return "—";
  return rec.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-slate-500";
  if (score >= 8) return "text-emerald-600 font-semibold";
  if (score >= 5) return "text-amber-600";
  return "text-red-600";
}

function scoreBgColor(score: number | null): string {
  if (score == null) return "bg-slate-100";
  if (score >= 8) return "bg-emerald-500";
  if (score >= 5) return "bg-amber-500";
  return "bg-red-500";
}

export default function ComparePage() {
  const { startTourIfNew } = useWalkthrough();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CompareCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [showShortlistedOnly, setShowShortlistedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("overall_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [debriefContent, setDebriefContent] = useState<string | null>(null);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [showDebrief, setShowDebrief] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const res = await api.getJobPostings(1, { is_active: true });
      setJobs(res.items);
      if (res.items.length > 0 && !selectedJobId) {
        setSelectedJobId(res.items[0].id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [selectedJobId]);

  const loadCandidates = useCallback(async () => {
    if (!selectedJobId) {
      setCandidates([]);
      return;
    }
    setLoadingCandidates(true);
    try {
      const data = await api.compareCandidates(selectedJobId);
      setCandidates(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load candidates");
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  }, [selectedJobId]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    if (!loading) startTourIfNew("compare-page");
  }, [loading, startTourIfNew]);

  const handleToggleShortlist = async (sessionId: string) => {
    setTogglingId(sessionId);
    try {
      const res = await api.toggleShortlist(sessionId);
      setCandidates((prev) =>
        prev.map((c) =>
          c.session_id === sessionId ? { ...c, is_shortlisted: res.is_shortlisted } : c,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update shortlist");
    } finally {
      setTogglingId(null);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "overall_score" || key === "confidence_score" || key === "duration_seconds"
          ? "desc"
          : "asc",
      );
    }
  };

  const filtered = showShortlistedOnly
    ? candidates.filter((c) => c.is_shortlisted)
    : candidates;

  const sorted = [...filtered].sort((a, b) => {
    let va: string | number | boolean | null;
    let vb: string | number | boolean | null;
    switch (sortKey) {
      case "candidate_name":
        va = (a.candidate_name ?? a.candidate_email ?? "").toLowerCase();
        vb = (b.candidate_name ?? b.candidate_email ?? "").toLowerCase();
        break;
      case "overall_score":
        va = a.overall_score ?? -1;
        vb = b.overall_score ?? -1;
        break;
      case "recommendation":
        va = a.recommendation ?? "";
        vb = b.recommendation ?? "";
        break;
      case "confidence_score":
        va = a.confidence_score ?? -1;
        vb = b.confidence_score ?? -1;
        break;
      case "duration_seconds":
        va = a.duration_seconds ?? -1;
        vb = b.duration_seconds ?? -1;
        break;
      case "is_shortlisted":
        va = a.is_shortlisted ? 1 : 0;
        vb = b.is_shortlisted ? 1 : 0;
        break;
      case "completed_at":
        va = a.completed_at ?? "";
        vb = b.completed_at ?? "";
        break;
      default:
        return 0;
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const maxScore = Math.max(
    ...candidates.map((c) => c.overall_score ?? 0).filter((s) => s > 0),
    10,
  );

  const topN = 3;
  const topScoredIndices = new Map(
    [...candidates]
      .filter((c) => (c.overall_score ?? 0) > 0)
      .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
      .slice(0, topN)
      .map((c, i) => [c.session_id, i + 1] as const),
  );

  const handleGenerateDebrief = async () => {
    let selectedIds = candidates
      .filter((c) => c.is_shortlisted)
      .map((c) => c.session_id);
    if (selectedIds.length < 2) {
      selectedIds = candidates
        .sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0))
        .slice(0, Math.min(5, candidates.length))
        .map((c) => c.session_id);
    }
    const uniqueIds = Array.from(new Set(selectedIds)).slice(0, 5);
    if (uniqueIds.length < 2) {
      toast.error("Need at least 2 candidates for a debrief");
      return;
    }
    setDebriefLoading(true);
    try {
      const result = await api.generateDebrief(uniqueIds);
      setDebriefContent(result.debrief);
      setShowDebrief(true);
    } catch {
      toast.error("Failed to generate debrief");
    } finally {
      setDebriefLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = [
      "Name",
      "Email",
      "Score",
      "Recommendation",
      "Confidence",
      "Duration (min)",
      "Shortlisted",
      "Completed At",
    ];
    const rows = sorted.map((c) => [
      c.candidate_name ?? "",
      c.candidate_email ?? "",
      c.overall_score ?? "",
      formatRecommendation(c.recommendation),
      c.confidence_score ?? "",
      c.duration_seconds != null ? (c.duration_seconds / 60).toFixed(1) : "",
      c.is_shortlisted ? "Yes" : "No",
      c.completed_at ?? "",
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `candidates-comparison-${selectedJobId ?? "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const SortIcon = ({ column }: { column: SortKey }) =>
    sortKey === column ? (
      sortDir === "asc" ? (
        <ChevronUp className="ml-1 h-4 w-4" />
      ) : (
        <ChevronDown className="ml-1 h-4 w-4" />
      )
    ) : null;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Candidate Comparison</h1>
        <p className="mt-1 text-sm text-slate-500">
          Compare candidates side-by-side, sort by scores, and shortlist top performers
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div data-tour="compare-job-select" className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-700">Job</label>
          <select
            value={selectedJobId ?? ""}
            onChange={(e) => setSelectedJobId(e.target.value || null)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Select a job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>

          <label className="ml-4 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showShortlistedOnly}
              onChange={(e) => setShowShortlistedOnly(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <Filter className="h-4 w-4" />
            Show only shortlisted
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            data-tour="compare-debrief"
            onClick={handleGenerateDebrief}
            disabled={candidates.length < 2 || debriefLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-100 disabled:opacity-50"
          >
            {debriefLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Generate AI Debrief
          </button>
          <button
            onClick={exportCSV}
            disabled={sorted.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {loadingCandidates ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : !selectedJobId ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">Select a job</h3>
          <p className="mt-1 text-sm text-slate-500">
            Choose a job from the dropdown above to compare its candidates.
          </p>
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No completed interviews</h3>
          <p className="mt-1 text-sm text-slate-500">
            This job has no completed interviews yet. Run interviews and complete them to compare
            candidates here.
          </p>
        </div>
      ) : (
        <div data-tour="compare-table" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    #
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                    onClick={() => handleSort("candidate_name")}
                  >
                    <span className="flex items-center">
                      Name
                      <SortIcon column="candidate_name" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                    onClick={() => handleSort("overall_score")}
                  >
                    <span className="flex items-center">
                      Score
                      <SortIcon column="overall_score" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    Score bar
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                    onClick={() => handleSort("recommendation")}
                  >
                    <span className="flex items-center">
                      Recommendation
                      <SortIcon column="recommendation" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                    onClick={() => handleSort("confidence_score")}
                  >
                    <span className="flex items-center">
                      Confidence
                      <SortIcon column="confidence_score" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                    onClick={() => handleSort("duration_seconds")}
                  >
                    <span className="flex items-center">
                      Duration
                      <SortIcon column="duration_seconds" />
                    </span>
                  </th>
                  <th
                    data-tour="compare-shortlist"
                    className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                    onClick={() => handleSort("is_shortlisted")}
                  >
                    <span className="flex items-center">
                      Shortlisted
                      <SortIcon column="is_shortlisted" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sorted.map((c, idx) => {
                  const score = c.overall_score ?? 0;
                  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
                  const topRank = topScoredIndices.get(c.session_id);
                  return (
                    <tr key={c.session_id} className="transition-colors hover:bg-slate-50/50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {topRank != null ? (
                          <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-800">
                            Top {topRank}
                          </span>
                        ) : (
                          idx + 1
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {c.candidate_name ?? c.candidate_email ?? "—"}
                        </div>
                        {c.candidate_email && c.candidate_name && (
                          <div className="text-xs text-slate-500">{c.candidate_email}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={cn("text-sm", scoreColor(score))}>
                          {score > 0 ? score.toFixed(1) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-2 w-24 min-w-[96px] overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              scoreBgColor(score),
                            )}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {formatRecommendation(c.recommendation)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {c.confidence_score != null
                          ? (c.confidence_score * 100).toFixed(0) + "%"
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {formatDuration(c.duration_seconds)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          onClick={() => handleToggleShortlist(c.session_id)}
                          disabled={togglingId === c.session_id}
                          className={cn(
                            "rounded p-1.5 transition-colors",
                            c.is_shortlisted
                              ? "text-amber-500 hover:bg-amber-50"
                              : "text-slate-300 hover:bg-slate-100 hover:text-amber-400",
                          )}
                          aria-label={
                            c.is_shortlisted ? "Remove from shortlist" : "Add to shortlist"
                          }
                        >
                          {togglingId === c.session_id ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Star
                              className={cn("h-5 w-5", c.is_shortlisted && "fill-current")}
                            />
                          )}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/dashboard/interviews/${c.session_id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                        >
                          <Eye className="h-4 w-4" />
                          View Report
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Debrief Modal */}
      {showDebrief && debriefContent && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">AI Hiring Debrief</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </button>
              <button
                onClick={() => {
                  setShowDebrief(false);
                  setDebriefContent(null);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <pre className="mx-auto max-w-3xl whitespace-pre-wrap rounded-lg bg-slate-50 p-6 font-sans text-sm leading-relaxed text-slate-800">
              {debriefContent}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
