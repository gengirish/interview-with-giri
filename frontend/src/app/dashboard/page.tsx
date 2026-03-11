"use client";

import { useEffect, useState } from "react";
import { api, type DashboardStats } from "@/lib/api";
import {
  Briefcase,
  MessageSquare,
  TrendingUp,
  Users,
  Loader2,
  CalendarDays,
  Target,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getDashboardStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cards = stats
    ? [
        {
          label: "Active Jobs",
          value: String(stats.active_jobs),
          icon: Briefcase,
          color: "text-indigo-600 bg-indigo-50",
        },
        {
          label: "Total Interviews",
          value: String(stats.total_interviews),
          icon: MessageSquare,
          color: "text-blue-600 bg-blue-50",
        },
        {
          label: "This Month",
          value: String(stats.interviews_this_month),
          icon: CalendarDays,
          color: "text-violet-600 bg-violet-50",
        },
        {
          label: "Completed",
          value: String(stats.completed_interviews),
          icon: Users,
          color: "text-emerald-600 bg-emerald-50",
        },
        {
          label: "Avg Score",
          value: stats.avg_score != null ? stats.avg_score.toFixed(1) : "N/A",
          icon: TrendingUp,
          color: "text-amber-600 bg-amber-50",
        },
        {
          label: "Pass Rate",
          value:
            stats.pass_rate != null ? `${stats.pass_rate.toFixed(0)}%` : "N/A",
          icon: Target,
          color: "text-rose-600 bg-rose-50",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
        <p className="text-slate-500">
          Welcome to your Interview Bot dashboard
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">
                  {card.label}
                </span>
                <div
                  className={`rounded-lg p-2 ${card.color}`}
                >
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-bold text-slate-900">
                  {card.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Getting Started
          </h2>
          <div className="mt-4 space-y-3">
            {[
              "Create a job posting with role details and requirements",
              "Configure interview format (text, voice, or video)",
              "Generate and share interview links with candidates",
              "Review AI-generated reports and compare candidates",
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                  {i + 1}
                </div>
                <p className="text-sm text-slate-600">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Quick Actions</h2>
          <div className="mt-4 space-y-3">
            <Link
              href="/dashboard/jobs"
              className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
            >
              <Briefcase className="h-5 w-5 text-indigo-600" />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Create Job Posting
                </p>
                <p className="text-xs text-slate-500">
                  Set up a new position for interviews
                </p>
              </div>
            </Link>
            <Link
              href="/dashboard/interviews"
              className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
            >
              <MessageSquare className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  View Interviews
                </p>
                <p className="text-xs text-slate-500">
                  See all candidate sessions and scores
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
