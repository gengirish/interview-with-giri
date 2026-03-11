"use client";

import { useEffect, useState } from "react";
import {
  api,
  type AnalyticsOverview,
  type JobAnalytics,
} from "@/lib/api";
import {
  BarChart3,
  Loader2,
  TrendingUp,
  Clock,
  Target,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [jobStats, setJobStats] = useState<JobAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getAnalyticsOverview(), api.getAnalyticsPerJob()])
      .then(([o, j]) => {
        setOverview(o);
        setJobStats(j);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <BarChart3 className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-4 text-lg font-medium text-slate-900">
          No analytics data yet
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Complete some interviews to see analytics.
        </p>
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

  const maxScoreCount = Math.max(
    ...Object.values(overview.score_distribution),
    1,
  );
  const maxStatusCount = Math.max(
    ...Object.values(overview.status_breakdown),
    1,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500 mt-1">
          Interview performance metrics and insights
        </p>
      </div>

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
