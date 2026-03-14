"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Bot, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface CopilotHistoryItem {
  id: string;
  interview_session_id: string;
  status: string;
  started_at: string;
}

export default function CopilotIndexPage() {
  const [history, setHistory] = useState<CopilotHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getCopilotHistory()
      .then((items) => setHistory(items as CopilotHistoryItem[]))
      .catch(() => {
        toast.error("Failed to load copilot history");
        setHistory([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">AI Interview Co-Pilot</h1>
        <p className="text-sm text-slate-500 mt-1">
          Real-time suggestions, competency tracking, and legal checks during live interviews.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Bot className="h-4 w-4 text-indigo-600" />
          How to use
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          Go to an <strong>in-progress</strong> interview and click{" "}
          <strong>Launch Co-Pilot</strong> to open the real-time sidebar with AI suggestions,
          competency coverage, and legal/bias checks.
        </p>
        <Link
          href="/dashboard/interviews?status=in_progress"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          View in-progress interviews
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {history.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Recent sessions</h2>
          <div className="space-y-2">
            {history.slice(0, 10).map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/copilot/${item.interview_session_id}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <span className="text-sm text-slate-700">
                  Session {item.started_at ? new Date(item.started_at).toLocaleString() : item.id.slice(0, 8)}
                </span>
                <span
                  className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                    item.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {item.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
