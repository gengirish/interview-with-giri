"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type InterviewSession } from "@/lib/api";
import {
  Loader2,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
} from "lucide-react";
import { cn, formatDuration, formatDate } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";

const statusConfig: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "bg-amber-50 text-amber-700",
  },
  in_progress: {
    label: "In Progress",
    icon: Loader2,
    color: "bg-blue-50 text-blue-700",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    color: "bg-green-50 text-green-700",
  },
  expired: {
    label: "Expired",
    icon: XCircle,
    color: "bg-slate-100 text-slate-600",
  },
  disconnected: {
    label: "Disconnected",
    icon: AlertCircle,
    color: "bg-red-50 text-red-700",
  },
};

export default function InterviewsPage() {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api.getInterviews(
        page,
        undefined,
        statusFilter || undefined,
      );
      setSessions(res.items);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load interviews");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Interviews</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} total interview sessions
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="disconnected">Disconnected</option>
        </select>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">
            No interviews yet
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Generate interview links from your job postings to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Candidate
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Format
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => {
                const cfg = statusConfig[s.status] || statusConfig.pending;
                const StatusIcon = cfg.icon;
                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">
                        {s.candidate_name || "Not started"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {s.candidate_email || s.token.slice(0, 8) + "..."}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                          cfg.color,
                        )}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 capitalize">
                      {s.format}
                    </td>
                    <td className="px-4 py-3">
                      {s.overall_score != null ? (
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            s.overall_score >= 7
                              ? "text-green-600"
                              : s.overall_score >= 5
                                ? "text-amber-600"
                                : "text-red-600",
                          )}
                        >
                          {s.overall_score.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDuration(s.duration_seconds)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDate(s.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.status === "completed" && (
                        <Link
                          href={`/dashboard/interviews/${s.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page} of {Math.ceil(total / 20)}
          </span>
          <button
            disabled={page >= Math.ceil(total / 20)}
            onClick={() => setPage(page + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
