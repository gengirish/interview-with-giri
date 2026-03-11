"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  api,
  type InterviewSession,
  type InterviewMessage,
  type CandidateReport,
} from "@/lib/api";
import {
  Loader2,
  FileText,
  Award,
  AlertTriangle,
  ThumbsUp,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function InterviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [report, setReport] = useState<CandidateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"report" | "transcript">("report");

  useEffect(() => {
    async function load() {
      try {
        const [s, msgs] = await Promise.all([
          api.getInterview(id),
          api.getInterviewMessages(id),
        ]);
        setSession(s);
        setMessages(msgs);

        try {
          const r = await api.getReport(id);
          setReport(r);
        } catch {
          // report may not exist yet
        }
      } catch {
        // error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleGenerateReport() {
    setGenerating(true);
    try {
      const r = await api.generateReport(id);
      setReport(r);
    } catch {
      // error
    } finally {
      setGenerating(false);
    }
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return "--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }

  function recommendationStyle(rec: string | null) {
    if (!rec) return "bg-slate-100 text-slate-600";
    if (rec === "strong_hire") return "bg-green-100 text-green-800";
    if (rec === "hire") return "bg-blue-100 text-blue-800";
    return "bg-red-100 text-red-800";
  }

  function recommendationLabel(rec: string | null) {
    if (!rec) return "Pending";
    return rec.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!session) {
    return <div className="text-slate-500">Interview not found.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/interviews"
          className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-slate-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">
            {session.candidate_name || "Unknown Candidate"}
          </h1>
          <p className="text-sm text-slate-500">
            {session.candidate_email} &middot; {session.format} &middot;{" "}
            {formatDuration(session.duration_seconds)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {session.overall_score != null && (
            <div className="text-right">
              <span className="text-2xl font-bold text-slate-900">
                {session.overall_score.toFixed(1)}
              </span>
              <span className="text-sm text-slate-500">/10</span>
            </div>
          )}
          {report && (
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

      {/* Tab buttons */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          onClick={() => setActiveTab("report")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "report"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <FileText className="inline h-4 w-4 mr-1.5" />
          Report
        </button>
        <button
          onClick={() => setActiveTab("transcript")}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "transcript"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <FileText className="inline h-4 w-4 mr-1.5" />
          Transcript ({messages.length})
        </button>
      </div>

      {activeTab === "report" ? (
        report ? (
          <div className="space-y-6">
            {/* AI Summary */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                AI Summary
              </h3>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                {report.ai_summary}
              </p>
              {report.confidence_score != null && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Confidence:</span>
                  <div className="h-2 w-24 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${report.confidence_score * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-700">
                    {(report.confidence_score * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>

            {/* Skill Scores */}
            {Object.keys(report.skill_scores).length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Award className="h-4 w-4 text-indigo-600" />
                  Technical Skills
                </h3>
                <div className="mt-4 space-y-4">
                  {Object.entries(report.skill_scores).map(
                    ([skill, data]) => (
                      <div key={skill}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-700 capitalize">
                            {skill.replace("_", " ")}
                          </span>
                          <span
                            className={cn(
                              "text-sm font-bold",
                              data.score >= 7
                                ? "text-green-600"
                                : data.score >= 5
                                  ? "text-amber-600"
                                  : "text-red-600",
                            )}
                          >
                            {data.score.toFixed(1)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              data.score >= 7
                                ? "bg-green-500"
                                : data.score >= 5
                                  ? "bg-amber-500"
                                  : "bg-red-500",
                            )}
                            style={{ width: `${data.score * 10}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-slate-500 italic">
                          &ldquo;{data.evidence}&rdquo;
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* Behavioral Scores */}
            {Object.keys(report.behavioral_scores).length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">
                  Behavioral Assessment
                </h3>
                <div className="mt-4 space-y-4">
                  {Object.entries(report.behavioral_scores).map(
                    ([area, data]) => (
                      <div key={area}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-700 capitalize">
                            {area.replace("_", " ")}
                          </span>
                          <span
                            className={cn(
                              "text-sm font-bold",
                              data.score >= 7
                                ? "text-green-600"
                                : data.score >= 5
                                  ? "text-amber-600"
                                  : "text-red-600",
                            )}
                          >
                            {data.score.toFixed(1)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              data.score >= 7
                                ? "bg-green-500"
                                : data.score >= 5
                                  ? "bg-amber-500"
                                  : "bg-red-500",
                            )}
                            style={{ width: `${data.score * 10}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-slate-500 italic">
                          &ldquo;{data.evidence}&rdquo;
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* Strengths & Concerns */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-green-200 bg-green-50/50 p-6">
                <h3 className="text-sm font-semibold text-green-800 flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4" />
                  Strengths
                </h3>
                <ul className="mt-3 space-y-2">
                  {report.strengths.map((s, i) => (
                    <li
                      key={i}
                      className="text-sm text-green-700 flex items-start gap-2"
                    >
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-6">
                <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Concerns
                </h3>
                <ul className="mt-3 space-y-2">
                  {report.concerns.map((c, i) => (
                    <li
                      key={i}
                      className="text-sm text-amber-700 flex items-start gap-2"
                    >
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <FileText className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-medium text-slate-900">
              No report generated yet
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Generate an AI-powered report to get detailed scoring and
              recommendations.
            </p>
            <button
              onClick={handleGenerateReport}
              disabled={
                generating || session.status !== "completed"
              }
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {generating && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              <Sparkles className="h-4 w-4" />
              Generate Report
            </button>
          </div>
        )
      ) : (
        /* Transcript */
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "px-6 py-4",
                  msg.role === "interviewer" ? "bg-slate-50" : "",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wider",
                      msg.role === "interviewer"
                        ? "text-indigo-600"
                        : "text-slate-600",
                    )}
                  >
                    {msg.role === "interviewer"
                      ? "AI Interviewer"
                      : "Candidate"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
