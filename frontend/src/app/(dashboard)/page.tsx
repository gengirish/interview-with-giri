"use client";

import { Briefcase, MessageSquare, TrendingUp, Users } from "lucide-react";

export default function DashboardPage() {
  const stats = [
    { label: "Active Jobs", value: "0", icon: Briefcase, change: "+0%" },
    { label: "Total Interviews", value: "0", icon: MessageSquare, change: "+0%" },
    { label: "Candidates", value: "0", icon: Users, change: "+0%" },
    { label: "Avg Score", value: "N/A", icon: TrendingUp, change: "0%" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
        <p className="text-slate-500">Welcome to your Interview Bot dashboard</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                {stat.label}
              </span>
              <stat.icon className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-slate-900">
                {stat.value}
              </span>
              <span className="ml-2 text-sm text-emerald-600">
                {stat.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Getting Started</h2>
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
              1
            </div>
            <p className="text-slate-600">Create a job posting with role details and requirements</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
              2
            </div>
            <p className="text-slate-600">Configure interview format (text, voice, or video)</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
              3
            </div>
            <p className="text-slate-600">Generate and share interview links with candidates</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
              4
            </div>
            <p className="text-slate-600">Review AI-generated reports and compare candidates</p>
          </div>
        </div>
      </div>
    </div>
  );
}
