"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type InterviewSession } from "@/lib/api";
import { FileText, Loader2, Eye } from "lucide-react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import { useWalkthrough } from "@/hooks/use-walkthrough";

export default function ReportsPage() {
  const { startTourIfNew } = useWalkthrough();
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [jobMap, setJobMap] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [interviewsRes, jobsRes] = await Promise.all([
        api.getInterviews(page, undefined, "completed"),
        api.getJobPostings(1),
      ]);
      setSessions(interviewsRes.items);
      setTotal(interviewsRes.total);
      const map: Record<string, string> = {};
      for (const j of jobsRes.items) {
        map[j.id] = j.title;
      }
      setJobMap(map);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!loading) startTourIfNew("reports-page");
  }, [loading, startTourIfNew]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">
          View candidate assessment reports
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">
            No reports yet
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Completed interviews will appear here. Run interviews and complete them to see reports.
          </p>
        </div>
      ) : (
        <div data-tour="reports-list" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Candidate
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Job
                </th>
                <th data-tour="report-recommendation" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Score
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
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-900">
                      {s.candidate_name || "Not started"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {s.candidate_email || s.token.slice(0, 8) + "..."}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {jobMap[s.job_posting_id] || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {s.overall_score != null ? (
                      <span
                        className={
                          s.overall_score >= 7
                            ? "text-sm font-semibold text-green-600"
                            : s.overall_score >= 5
                              ? "text-sm font-semibold text-amber-600"
                              : "text-sm font-semibold text-red-600"
                        }
                      >
                        {s.overall_score.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDate(s.completed_at ?? s.created_at)}
                  </td>
                  <td data-tour="report-view" className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/interviews/${s.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Eye className="h-3 w-3" />
                      View Report
                    </Link>
                  </td>
                </tr>
              ))}
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
