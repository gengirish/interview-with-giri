"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type AnalyticsOverview,
  type JobAnalytics,
} from "@/lib/api";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Lightbulb,
  Loader2,
  Target,
  TrendingUp,
  XCircle,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SkillsInsights = {
  total_candidates: number;
  skill_averages: Record<
    string,
    { avg: number; min: number; max: number; count: number; std_dev: number }
  >;
  behavioral_averages: Record<string, { avg: number; count: number }>;
  skill_gaps: Array<{ skill: string; avg: number; count: number }>;
  skill_strengths: Array<{ skill: string; avg: number; count: number }>;
  recommendations: string[];
};

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [jobStats, setJobStats] = useState<JobAnalytics[]>([]);
  const [skillsInsights, setSkillsInsights] = useState<SkillsInsights | null>(
    null,
  );
  const [skillsInsightsJobId, setSkillsInsightsJobId] = useState<
    string | undefined
  >(undefined);
  const [loading, setLoading] = useState(true);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSkillsInsights = useCallback((jobId?: string) => {
    setSkillsLoading(true);
    api
      .getSkillsInsights(jobId)
      .then(setSkillsInsights)
      .catch(() => setSkillsInsights(null))
      .finally(() => setSkillsLoading(false));
  }, []);

  const [satisfaction, setSatisfaction] = useState<{
    total_responses: number;
    avg_overall: number | null;
    avg_fairness: number | null;
    avg_clarity: number | null;
    avg_relevance: number | null;
    nps_score: number | null;
    rating_distribution: Record<string, number>;
    recent_comments: Array<{
      comment: string;
      rating: number;
      created_at: string;
    }>;
  } | null>(null);

  const fetchAnalytics = () => {
    setError(null);
    setLoading(true);
    Promise.allSettled([
      api.getAnalyticsOverview(),
      api.getAnalyticsPerJob(),
      api.getCandidateSatisfaction(),
    ]).then(([overviewResult, jobStatsResult, satisfactionResult]) => {
      const overviewFulfilled = overviewResult.status === "fulfilled";
      const jobStatsFulfilled = jobStatsResult.status === "fulfilled";
      if (overviewFulfilled) setOverview(overviewResult.value);
      if (jobStatsFulfilled) setJobStats(jobStatsResult.value);
      if (satisfactionResult.status === "fulfilled")
        setSatisfaction(satisfactionResult.value);
      if (!overviewFulfilled && !jobStatsFulfilled) {
        setError("Failed to load analytics");
      }
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    fetchSkillsInsights(skillsInsightsJobId);
  }, [skillsInsightsJobId, fetchSkillsInsights]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Interview performance metrics and insights
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-12 shadow-sm text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">
            Failed to load analytics
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Please try again.
          </p>
          <button
            onClick={fetchAnalytics}
            aria-label="Retry loading analytics"
            className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (
    !overview &&
    jobStats.length === 0 &&
    (!satisfaction || satisfaction.total_responses === 0)
  ) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Interview performance metrics and insights
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">
            No analytics data yet
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Complete some interviews to see analytics.
          </p>
        </div>
      </div>
    );
  }

  const scoreColors: Record<string, string> = {
    "0-3.9": "bg-red-500",
    "4-5.9": "bg-amber-500",
    "6-7.9": "bg-blue-500",
    "8-10": "bg-green-500",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-amber-400",
    in_progress: "bg-blue-400",
    completed: "bg-green-400",
    disconnected: "bg-red-400",
    expired: "bg-slate-400",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500 mt-1">
          Interview performance metrics and insights
        </p>
      </div>

      {overview && (() => {
        const maxScoreCount = Math.max(
          ...Object.values(overview.score_distribution),
          1,
        );
        const maxStatusCount = Math.max(
          ...Object.values(overview.status_breakdown),
          1,
        );
        return (
          <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: "Total",
            value: overview.total_interviews,
            icon: BarChart3,
            color: "text-indigo-600 bg-indigo-50",
          },
          {
            label: "Completed",
            value: overview.completed_interviews,
            icon: CheckCircle2,
            color: "text-green-600 bg-green-50",
          },
          {
            label: "Completion Rate",
            value: `${overview.completion_rate}%`,
            icon: Target,
            color: "text-violet-600 bg-violet-50",
          },
          {
            label: "Avg Score",
            value: overview.avg_score?.toFixed(1) ?? "N/A",
            icon: TrendingUp,
            color: "text-amber-600 bg-amber-50",
          },
          {
            label: "Avg Duration",
            value: overview.avg_duration_minutes
              ? `${overview.avg_duration_minutes} min`
              : "N/A",
            icon: Clock,
            color: "text-blue-600 bg-blue-50",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                {card.label}
              </span>
              <div className={`rounded-lg p-1.5 ${card.color}`}>
                <card.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-slate-900">
                {card.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Score Distribution */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">
            Score Distribution
          </h3>
          <div className="space-y-3">
            {["0-3.9", "4-5.9", "6-7.9", "8-10"].map((range) => {
              const count = overview.score_distribution[range] || 0;
              return (
                <div key={range} className="flex items-center gap-3">
                  <span className="w-12 text-xs font-medium text-slate-600">
                    {range}
                  </span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        scoreColors[range],
                      )}
                      style={{
                        width: `${(count / maxScoreCount) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-semibold text-slate-700">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">
            Status Breakdown
          </h3>
          <div className="space-y-3">
            {Object.entries(overview.status_breakdown).map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <span className="w-24 text-xs font-medium text-slate-600 capitalize">
                  {status.replace("_", " ")}
                </span>
                <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      statusColors[status] || "bg-slate-400",
                    )}
                    style={{
                      width: `${(count / maxStatusCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-semibold text-slate-700">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Format Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">
            Interview Formats
          </h3>
          <div className="flex items-end gap-6 h-40">
            {Object.entries(overview.format_breakdown).map(([format, count]) => {
              const maxFormat = Math.max(
                ...Object.values(overview.format_breakdown),
              );
              const height = maxFormat > 0 ? (count / maxFormat) * 100 : 0;
              return (
                <div key={format} className="flex flex-col items-center flex-1">
                  <span className="text-sm font-bold text-slate-900 mb-2">
                    {count}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-indigo-500 transition-all duration-500"
                    style={{ height: `${height}%`, minHeight: count > 0 ? "8px" : "0" }}
                  />
                  <span className="mt-2 text-xs font-medium text-slate-600 capitalize">
                    {format}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
          </>
        );
      })()}

      {/* Candidate Experience */}
      {satisfaction && satisfaction.total_responses > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">
            Candidate Experience
          </h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="text-center">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                NPS Score
              </p>
              <p
                className={cn(
                  "mt-1 text-4xl font-bold",
                  satisfaction.nps_score != null
                    ? satisfaction.nps_score > 50
                      ? "text-green-600"
                      : satisfaction.nps_score >= 0
                        ? "text-amber-600"
                        : "text-red-600"
                    : "text-slate-400",
                )}
              >
                {satisfaction.nps_score != null
                  ? satisfaction.nps_score.toFixed(1)
                  : "N/A"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {satisfaction.total_responses} response
                {satisfaction.total_responses !== 1 ? "s" : ""}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Average Ratings
              </p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Overall</span>
                  <span className="font-medium text-slate-900">
                    {satisfaction.avg_overall?.toFixed(1) ?? "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Fairness</span>
                  <span className="font-medium text-slate-900">
                    {satisfaction.avg_fairness?.toFixed(1) ?? "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Clarity</span>
                  <span className="font-medium text-slate-900">
                    {satisfaction.avg_clarity?.toFixed(1) ?? "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Relevance</span>
                  <span className="font-medium text-slate-900">
                    {satisfaction.avg_relevance?.toFixed(1) ?? "N/A"}
                  </span>
                </div>
              </div>
            </div>
            <div className="lg:col-span-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                Rating Distribution
              </p>
              <div className="space-y-2">
                {["5", "4", "3", "2", "1"].map((r) => {
                  const count =
                    satisfaction.rating_distribution[r] ?? 0;
                  const maxCount = Math.max(
                    ...Object.values(satisfaction.rating_distribution),
                    1,
                  );
                  return (
                    <div
                      key={r}
                      className="flex items-center gap-3"
                    >
                      <span className="w-4 text-xs font-medium text-slate-600">
                        {r}
                      </span>
                      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                          style={{
                            width: `${(count / maxCount) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-6 text-right text-xs font-medium text-slate-700">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {satisfaction.recent_comments.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                Recent Comments
              </p>
              <ul className="space-y-2 max-h-32 overflow-y-auto">
                {satisfaction.recent_comments.map((c, i) => (
                  <li
                    key={i}
                    className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2"
                  >
                    <span className="font-medium text-amber-600">
                      {c.rating}/5
                    </span>{" "}
                    {c.comment}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Skills Insights */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Skills Insights
          </h3>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">
              Job filter:
            </label>
            <select
              value={skillsInsightsJobId ?? ""}
              onChange={(e) =>
                setSkillsInsightsJobId(e.target.value || undefined)
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All jobs</option>
              {jobStats.map((j) => (
                <option key={j.job_id} value={j.job_id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="p-6">
          {skillsLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : !skillsInsights || skillsInsights.total_candidates === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <BarChart3 className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">
                No skills data yet. Complete interviews with reports to see
                insights.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Skill Heatmap */}
              {Object.keys(skillsInsights.skill_averages).length > 0 && (
                <div>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Skill Heatmap
                  </h4>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {Object.entries(skillsInsights.skill_averages).map(
                      ([skill, data]) => {
                        const avg = data.avg;
                        const heatColor =
                          avg < 5
                            ? "bg-red-500 text-white"
                            : avg < 7
                              ? "bg-amber-400 text-slate-900"
                              : "bg-emerald-500 text-white";
                        return (
                          <div
                            key={skill}
                            className={cn(
                              "rounded-lg px-3 py-2 text-center text-sm font-medium",
                              heatColor,
                            )}
                            title={`${skill}: avg ${avg}, min ${data.min}, max ${data.max} (n=${data.count})`}
                          >
                            <div className="truncate font-medium">
                              {skill.replace(/_/g, " ")}
                            </div>
                            <div className="text-xs opacity-90">
                              {avg.toFixed(1)}/10
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              )}

              <div className="grid gap-6 sm:grid-cols-2">
                {/* Skills Gaps */}
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-700">
                    <XCircle className="h-4 w-4" />
                    Skills Gaps (avg &lt; 5.0)
                  </h4>
                  {skillsInsights.skill_gaps.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No significant gaps identified.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {skillsInsights.skill_gaps.map((g) => (
                        <li
                          key={g.skill}
                          className="flex items-center justify-between rounded bg-white px-3 py-2 text-sm text-red-800"
                        >
                          <span>
                            {g.skill.replace(/_/g, " ")} (n={g.count})
                          </span>
                          <span className="font-semibold">
                            {g.avg.toFixed(1)}/10
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Skills Strengths */}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    <CheckCircle className="h-4 w-4" />
                    Skills Strengths (avg ≥ 7.0)
                  </h4>
                  {skillsInsights.skill_strengths.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No standout strengths yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {skillsInsights.skill_strengths.map((s) => (
                        <li
                          key={s.skill}
                          className="flex items-center justify-between rounded bg-white px-3 py-2 text-sm text-emerald-800"
                        >
                          <span>
                            {s.skill.replace(/_/g, " ")} (n={s.count})
                          </span>
                          <span className="font-semibold">
                            {s.avg.toFixed(1)}/10
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* AI Recommendations */}
              {skillsInsights.recommendations.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
                    <Lightbulb className="h-4 w-4" />
                    AI Recommendations
                  </h4>
                  <ul className="space-y-2">
                    {skillsInsights.recommendations.map((rec, i) => (
                      <li
                        key={i}
                        className="flex gap-2 rounded bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Behavioral Averages */}
              {Object.keys(skillsInsights.behavioral_averages).length > 0 && (
                <div>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Behavioral Dimension Averages
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(skillsInsights.behavioral_averages).map(
                      ([dim, data]) => {
                        const avg = data.avg;
                        const maxVal = 10;
                        const pct = (avg / maxVal) * 100;
                        return (
                          <div
                            key={dim}
                            className="flex items-center gap-3"
                          >
                            <span className="w-40 truncate text-sm font-medium text-slate-700">
                              {dim.replace(/_/g, " ")}
                            </span>
                            <div className="flex-1 h-5 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  avg < 5
                                    ? "bg-red-500"
                                    : avg < 7
                                      ? "bg-amber-500"
                                      : "bg-emerald-500",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-12 text-right text-sm font-semibold text-slate-700">
                              {avg.toFixed(1)}
                            </span>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Per-Job Analytics */}
      {jobStats.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">
              Per-Job Performance
            </h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Job
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">
                  Total
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">
                  Completed
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">
                  Avg Score
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">
                  Avg Duration
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobStats.map((job) => (
                <tr key={job.job_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-900">
                      {job.title}
                    </div>
                    <div className="text-xs text-slate-500 capitalize">
                      {job.role_type}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-slate-700">
                    {job.total_interviews}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-slate-700">
                    {job.completed_interviews}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {job.avg_score != null ? (
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          job.avg_score >= 7
                            ? "text-green-600"
                            : job.avg_score >= 5
                              ? "text-amber-600"
                              : "text-red-600",
                        )}
                      >
                        {job.avg_score.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-slate-700">
                    {job.avg_duration_minutes
                      ? `${job.avg_duration_minutes} min`
                      : "--"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        job.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {job.is_active ? "Active" : "Closed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
