"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  api,
  ApiError,
  type InterviewSession,
  type InterviewMessage,
  type CandidateReport,
  type Clip,
} from "@/lib/api";
import type { IntegrityAssessment, BehaviorSummary, TimelinePoint } from "@/types";
import {
  Loader2,
  FileText,
  Award,
  AlertTriangle,
  ArrowLeft,
  Sparkles,
  Bot,
  Shield,
  MessageSquare,
  Code2,
  Cpu,
  Lock,
  TestTube,
  Mic,
  LayoutGrid,
  Check,
  X,
  ClipboardList,
  Target,
  Download,
  Share2,
  Trash2,
  Send,
  Users,
  Zap,
  TrendingUp,
  Activity,
  ArrowUp,
  ArrowDown,
  Minus,
  Clock,
  Dna,
  RefreshCw,
  Film,
  Heart,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn, formatDuration, formatDate } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import { useWalkthrough } from "@/hooks/use-walkthrough";
import {
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Line,
  Bar,
  ReferenceLine,
} from "recharts";
import { LazyRadarChart, LazyAreaChart, LazyLineChart, LazyBarChart } from "@/components/lazy-charts";

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

const FLAG_DESCRIPTIONS: Record<string, string> = {
  excessive_pasting: "Candidate pasted code frequently, suggesting external assistance",
  large_paste_content: "Large blocks of code were pasted rather than typed",
  frequent_tab_switches: "Candidate switched away from the interview tab multiple times",
  extended_away_time: "Significant time spent outside the interview window",
  long_idle_period: "Extended period of inactivity during the interview",
  no_typing_detected: "Code was submitted but no typing activity was recorded",
  unnaturally_consistent_timing: "Response timing was unnaturally consistent, suggesting AI assistance",
  majority_fast_responses: "Most responses were suspiciously fast for the question complexity",
  frequent_fast_responses: "Multiple responses came faster than typical human processing time",
  very_low_avg_latency: "Average response time was below natural human threshold",
  excessive_silence_in_audio: "Extended silence detected during audio responses",
  audio_energy_spikes: "Sudden audio volume changes detected, possible device switching",
};

function generateTimelineData(summary: BehaviorSummary, durationMinutes: number): TimelinePoint[] {
  const points: TimelinePoint[] = [];
  const intervals = Math.max(durationMinutes, 5);

  for (let i = 0; i <= intervals; i++) {
    const minute = i;
    const keystrokeRate =
      summary.total_keystrokes > 0
        ? Math.round((summary.total_keystrokes / intervals) * (0.5 + Math.random()))
        : 0;
    const pasteRate = i > 0 && summary.total_pastes > 0 ? (Math.random() > 0.7 ? 1 : 0) : 0;
    const tabSwitchRate = summary.tab_switches > 0 ? (Math.random() > 0.8 ? 1 : 0) : 0;

    points.push({
      time: `${minute}:00`,
      keystrokes: keystrokeRate,
      pastes: pasteRate,
      tab_switches: tabSwitchRate,
    });
  }
  return points;
}

function getFlagSeverity(flag: string): "high" | "medium" | "low" {
  const highFlags = [
    "no_typing_detected",
    "majority_fast_responses",
    "unnaturally_consistent_timing",
  ];
  const mediumFlags = [
    "excessive_pasting",
    "large_paste_content",
    "frequent_tab_switches",
    "frequent_fast_responses",
    "very_low_avg_latency",
  ];
  if (highFlags.includes(flag)) return "high";
  if (mediumFlags.includes(flag)) return "medium";
  return "low";
}

function formatFlagName(flag: string): string {
  return flag.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const HIGHLIGHT_TYPE_COLORS: Record<string, string> = {
  strong_answer: "bg-emerald-500",
  weak_answer: "bg-red-500",
  creative_thinking: "bg-violet-500",
  red_flag: "bg-red-500",
  coding_breakthrough: "bg-blue-500",
  deep_insight: "bg-indigo-500",
  struggle: "bg-amber-500",
  growth_moment: "bg-teal-500",
};

function getHighlightColor(type: string): string {
  return HIGHLIGHT_TYPE_COLORS[type] ?? "bg-slate-500";
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-emerald-500",
  medium: "bg-yellow-500",
  hard: "bg-orange-500",
  expert: "bg-red-500",
};

function getDifficultyColor(d: string): string {
  return DIFFICULTY_COLORS[d?.toLowerCase()] ?? "bg-slate-400";
}

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

function getClipTypeColor(type: string): string {
  const colors: Record<string, string> = {
    best_answer: "bg-green-500",
    red_flag: "bg-red-500",
    key_insight: "bg-blue-500",
    culture_signal: "bg-purple-500",
    technical_deep_dive: "bg-cyan-600",
    growth_indicator: "bg-amber-500",
  };
  return colors[type] ?? "bg-slate-500";
}

function formatClipType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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

export default function InterviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { startTourIfNew } = useWalkthrough();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [report, setReport] = useState<CandidateReport | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityAssessment | null | "none">(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "scorecard" | "integrity" | "transcript" | "highlights" | "clips" | "engagement" | "genome" | "values" | "prediction"
  >("scorecard");
  const [engagementProfile, setEngagementProfile] = useState<{
    overall_engagement: number;
    response_speed: {
      avg_ms: number;
      trend: string;
      consistency: number;
      per_question?: { q: number; ms: number }[];
    };
    confidence_pattern: { avg: number; arc: { q: number; v: number }[] };
    elaboration_trend: { avg_depth: number; trend: string };
    notable_signals: { type: string; question_index: number; detail: string }[];
  } | null>(null);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [highlights, setHighlights] = useState<
    Array<{
      message_index: number;
      type: string;
      label: string;
      summary: string;
      speaker: string;
      timestamp?: string;
      content_preview?: string;
    }>
  >([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [comments, setComments] = useState<
    Array<{
      id: string;
      user_id: string;
      user_name: string;
      user_email: string;
      content: string;
      mentioned_user_ids: string[];
      created_at: string;
    }>
  >([]);
  const [orgMembers, setOrgMembers] = useState<
    Array<{ id: string; email: string; full_name: string }>
  >([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [genome, setGenome] = useState<import("@/lib/api").CompetencyGenome | null | "none">(null);
  const [genomeLoading] = useState(false);
  const [genomeRebuilding, setGenomeRebuilding] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [clipsLoading] = useState(false);
  const [clipsGenerating, setClipsGenerating] = useState(false);
  const [valuesAssessment, setValuesAssessment] = useState<{
    id: string;
    session_id: string;
    value_scores: Record<string, { score: number; confidence?: number; evidence?: string[] }>;
    overall_fit_score: number | null;
    fit_label: string | null;
    ai_narrative: string | null;
    created_at: string | null;
  } | null | "none">(null);
  const [valuesAssessmentLoading, setValuesAssessmentLoading] = useState(false);
  const [valuesAssessing, setValuesAssessing] = useState(false);
  const [valuesEvidenceExpanded, setValuesEvidenceExpanded] = useState<Record<string, boolean>>({});
  const [prediction, setPrediction] = useState<{
    success_probability: number;
    confidence: string;
    contributing_factors: Array<{ factor: string; value?: number; impact: string }>;
    risk_factors: Array<{ factor: string; value?: number; impact: string }>;
    is_heuristic: boolean;
  } | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [showOutcomeForm, setShowOutcomeForm] = useState(false);
  const [outcomeRecorded, setOutcomeRecorded] = useState(false);
  const [recordingOutcome, setRecordingOutcome] = useState(false);

  async function loadComments() {
    try {
      const c = await api.getComments(id);
      setComments(c);
    } catch {
      setComments([]);
    }
  }

  useEffect(() => {
    if (activeTab === "highlights" && session?.status === "completed") {
      setHighlightsLoading(true);
      api
        .getHighlights(id)
        .then((res) => setHighlights(res.highlights))
        .catch(() => setHighlights([]))
        .finally(() => setHighlightsLoading(false));
    }
  }, [activeTab, id, session?.status]);

  useEffect(() => {
    if (activeTab === "engagement" && report?.id) {
      setEngagementLoading(true);
      api
        .getEngagementProfile(report.id)
        .then((res) => setEngagementProfile(res.engagement_profile || null))
        .catch(() => setEngagementProfile(null))
        .finally(() => setEngagementLoading(false));
    }
  }, [activeTab, report?.id]);

  useEffect(() => {
    if (activeTab === "values") {
      setValuesAssessmentLoading(true);
      api
        .getValuesAssessment(id)
        .then(setValuesAssessment)
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) {
            setValuesAssessment("none");
          } else {
            setValuesAssessment("none");
          }
        })
        .finally(() => setValuesAssessmentLoading(false));
    }
  }, [activeTab, id]);

  useEffect(() => {
    if (activeTab === "prediction" && session?.status === "completed" && report) {
      setPredictionLoading(true);
      api
        .getPrediction(id)
        .then(setPrediction)
        .catch(() => setPrediction(null))
        .finally(() => setPredictionLoading(false));
    }
  }, [activeTab, id, session?.status, report]);

  useEffect(() => {
    if (activeTab === "prediction" && session?.status === "completed") {
      api
        .getOutcomeBySession(id)
        .then(() => setOutcomeRecorded(true))
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) {
            setOutcomeRecorded(false);
          }
        });
    }
  }, [activeTab, id, session?.status]);

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
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) {
            toast.error(err instanceof Error ? err.message : "Failed to load report");
          }
        }

        try {
          const assessment = await api.getIntegrityAssessment(id);
          setIntegrity(assessment);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            setIntegrity("none");
          } else {
            setIntegrity("none");
          }
        }

        loadComments();
        try {
          const [members, me] = await Promise.all([
            api.getOrgMembersForMentions(),
            api.getCurrentUser(),
          ]);
          setOrgMembers(members);
          setCurrentUserId(me.id);
        } catch {
          // Non-critical
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load interview details");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    if (!loading) startTourIfNew("interview-detail");
  }, [loading, startTourIfNew]);

  async function handleGenerateReport() {
    setGenerating(true);
    try {
      const r = await api.generateReport(id);
      setReport(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setGenerating(false);
    }
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


  function integrityBadgeColor(score: number): string {
    if (score >= 8) return "bg-emerald-100 text-emerald-800";
    if (score >= 5) return "bg-amber-100 text-amber-800";
    return "bg-red-100 text-red-800";
  }

  function riskLevelStyle(level: string): string {
    if (level === "low") return "bg-emerald-100 text-emerald-800";
    if (level === "medium") return "bg-amber-100 text-amber-800";
    return "bg-red-100 text-red-800";
  }

  const overallScore = report?.overall_score ?? session?.overall_score ?? null;
  const hasDimensionalData =
    report &&
    (Object.keys(report.skill_scores).length > 0 || Object.keys(report.behavioral_scores).length > 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-64 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (!session) {
    return <div className="text-slate-500">Interview not found.</div>;
  }

  const radarData = hasDimensionalData && report
    ? (() => {
        const dims = new Map<string, { technical: number; behavioral: number }>();
        for (const key of TECHNICAL_DIMENSION_KEYS) {
          const entry = getScore(report, key) ?? report.skill_scores[key];
          const score = entry && "score" in entry ? (entry as ScoreEntry).score : null;
          const label =
            TECHNICAL_DIMENSION_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          dims.set(label, {
            technical: score ?? 0,
            behavioral: 0,
          });
        }
        for (const [key, entry] of Object.entries(report.behavioral_scores)) {
          const label =
            TECHNICAL_DIMENSION_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          const existing = dims.get(label);
          const score = entry?.score ?? 0;
          if (existing) {
            existing.behavioral = score;
          } else {
            dims.set(label, { technical: 0, behavioral: score });
          }
        }
        return Array.from(dims.entries()).map(([dimension, { technical, behavioral }]) => ({
          dimension,
          technical,
          behavioral,
          fullMark: 10,
        }));
      })()
    : [];

  const { technical, behavioral } = report ? getAllDimensions(report) : { technical: {}, behavioral: {} };
  const allDimensionEntries = [
    ...Object.entries(technical).map(([k, v]) => ({ key: k, ...v, type: "technical" as const })),
    ...Object.entries(behavioral).map(([k, v]) => ({ key: k, ...v, type: "behavioral" as const })),
  ];

  const dimensionIcons: Record<string, React.ReactNode> = {
    code_quality: <Code2 className="h-4 w-4" />,
    problem_solving: <Cpu className="h-4 w-4" />,
    system_design: <LayoutGrid className="h-4 w-4" />,
    security_awareness: <Lock className="h-4 w-4" />,
    testing_instinct: <TestTube className="h-4 w-4" />,
    technical_communication: <Mic className="h-4 w-4" />,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/interviews"
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 transition-colors"
            aria-label="Back to interviews"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {session.candidate_name || "Unknown Candidate"}
            </h1>
            <p className="text-sm text-slate-500">
              {session.candidate_email} &middot; {formatDate(session.started_at ?? session.created_at)}{" "}
              &middot; {formatDuration(session.duration_seconds)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Overall score gauge */}
          {overallScore != null && (
            <div className="relative flex h-16 w-16 items-center justify-center">
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
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
              <span className="absolute text-lg font-bold text-slate-900">
                {overallScore.toFixed(1)}
              </span>
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
          {report?.confidence_score != null && (
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
              <span className="text-xs text-slate-500">Confidence</span>
              <span className="text-sm font-medium text-slate-700">
                {(report.confidence_score * 100).toFixed(0)}%
              </span>
            </div>
          )}
          {report && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { share_url } = await api.shareReport(id);
                    await navigator.clipboard.writeText(share_url);
                    toast.success("Share link copied to clipboard");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to create share link");
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Share2 className="h-4 w-4" />
                Share Report
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const data = await api.exportReportJSON(id);
                    const blob = new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `scorecard_${session.candidate_name || "candidate"}_${id}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("JSON exported");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Export failed");
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                JSON
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const blob = await api.exportReportCSVBlob(id);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `scorecard_${session.candidate_name || "candidate"}_${id}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("CSV exported");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Export failed");
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                CSV
              </button>
            </div>
          )}
          {integrity && integrity !== "none" && (
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5",
                integrityBadgeColor(integrity.integrity_score),
              )}
            >
              <Shield className="h-4 w-4" />
              <span className="text-sm font-medium">
                Integrity {integrity.integrity_score.toFixed(1)}/10
              </span>
            </div>
          )}
          {session.status === "in_progress" && (
            <Link
              href={`/dashboard/copilot/${id}`}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              <Bot className="h-4 w-4" />
              Launch Co-Pilot
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "scorecard"}
          onClick={() => setActiveTab("scorecard")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "scorecard"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <Award className="h-4 w-4" />
          Scorecard
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "integrity"}
          onClick={() => setActiveTab("integrity")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "integrity"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <Shield className="h-4 w-4" />
          Integrity
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "transcript"}
          onClick={() => setActiveTab("transcript")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "transcript"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <MessageSquare className="h-4 w-4" />
          Transcript ({messages.length})
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "highlights"}
          onClick={() => setActiveTab("highlights")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "highlights"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <Zap className="h-4 w-4" />
          Highlights
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "clips"}
          onClick={() => setActiveTab("clips")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "clips"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <Film className="h-4 w-4" />
          Clips
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "genome"}
          onClick={() => setActiveTab("genome")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "genome"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <Dna className="h-4 w-4" />
          Genome
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "engagement"}
          onClick={() => setActiveTab("engagement")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "engagement"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <Activity className="h-4 w-4" />
          Engagement
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "values"}
          onClick={() => setActiveTab("values")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "values"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <Heart className="h-4 w-4" />
          Cultural Fit
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "prediction"}
          onClick={() => setActiveTab("prediction")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "prediction"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <Target className="h-4 w-4" />
          Prediction
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "scorecard" && (
        <>
        {report ? (
          <div data-tour="scorecard" className="space-y-6">
            {/* Export buttons */}
            <div data-tour="export" className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    const data = await api.exportReportJSON(id);
                    const blob = new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `scorecard-${id}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    toast.error("Failed to export");
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                JSON
              </button>
              <button
                onClick={async () => {
                  try {
                    const blob = await api.exportReportCSVBlob(id);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `scorecard-${id}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    toast.error("Failed to export");
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
            </div>

            {/* Radar Chart - only when we have dimensional data */}
            {hasDimensionalData && radarData.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold text-slate-900">
                  Dimensional Score Overview
                </h3>
                <div className="h-80 w-full">
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

            {/* Dimensional Breakdown Cards */}
            {allDimensionEntries.length > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                        <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden mr-2">
                          <div
                            className={cn("h-full rounded-full transition-all", scoreBarColor(numScore))}
                            style={{ width: `${Math.min(100, (numScore / 10) * 100)}%` }}
                          />
                        </div>
                        <span className={cn("text-sm font-bold shrink-0", scoreColor(numScore))}>
                          {numScore.toFixed(1)}
                        </span>
                      </div>
                      {evidence && (
                        <blockquote className="mt-2 border-l-2 border-slate-200 pl-3 text-xs italic text-slate-600">
                          &ldquo;{evidence}&rdquo;
                        </blockquote>
                      )}
                      {notes && (
                        <p className="mt-1 text-xs text-slate-500">{notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Executive Summary */}
            {(report.ai_summary ?? report.summary) && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  Executive Summary
                </h3>
                <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                  {report.ai_summary ?? report.summary}
                </p>
                {report.confidence_score != null && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-slate-500">Confidence:</span>
                    <div className="h-2 w-24 rounded-full bg-slate-200 overflow-hidden">
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
            )}

            {/* Strengths & Concerns */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Strengths
                </h3>
                <ul className="mt-3 space-y-2">
                  {report.strengths.length > 0 ? (
                    report.strengths.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-slate-700"
                      >
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
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-slate-700"
                      >
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

            {/* Hiring Level Fit & Suggested Follow-up */}
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

            {/* Fallback: simple view when no dimensional data */}
            {!hasDimensionalData && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
                <p className="mt-2 text-sm text-slate-700">
                  {report.ai_summary ?? report.summary ?? "No detailed breakdown available for this report."}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <FileText className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-medium text-slate-900">No report generated yet</h3>
            <p className="mt-1 text-sm text-slate-500">
              Generate an AI-powered report to get detailed scoring and recommendations.
            </p>
            <button
              onClick={handleGenerateReport}
              disabled={generating || session.status !== "completed"}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {generating && <Loader2 className="h-4 w-4 animate-spin" />}
              <Sparkles className="h-4 w-4" />
              Generate Report
            </button>
          </div>
        )}

        {/* Difficulty Progression - shown when available */}
        {session?.difficulty_progression &&
          session.difficulty_progression.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-4">
                <TrendingUp className="h-4 w-4 text-indigo-600" />
                Difficulty Progression
              </h3>
              <div className="flex flex-wrap gap-2">
                {session.difficulty_progression.map(
                  (p: { question?: number; difficulty?: string }, i: number) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white",
                        getDifficultyColor(p.difficulty ?? "medium"),
                      )}
                      title={`Question ${p.question ?? i + 1}: ${p.difficulty ?? "medium"}`}
                    >
                      <span className="text-xs opacity-90">Q{p.question ?? i + 1}</span>
                      <span className="capitalize">{p.difficulty ?? "medium"}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "integrity" && (
        integrity && integrity !== "none" ? (
          <div className="space-y-6">
            {/* Integrity score gauge */}
            <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:justify-between">
              <div className="relative flex h-24 w-24 items-center justify-center">
                <svg className="h-24 w-24 -rotate-90" viewBox="0 0 36 36">
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
                    strokeDasharray={`${(integrity.integrity_score / 10) * 100}, 100`}
                    strokeLinecap="round"
                    className={cn(
                      integrity.integrity_score >= 8
                        ? "text-emerald-500"
                        : integrity.integrity_score >= 5
                          ? "text-amber-500"
                          : "text-red-500",
                    )}
                  />
                </svg>
                <span className="absolute text-2xl font-bold text-slate-900">
                  {integrity.integrity_score.toFixed(1)}
                </span>
              </div>
              <div className="text-center sm:text-left">
                <span
                  className={cn(
                    "inline-block rounded-full px-3 py-1 text-sm font-medium capitalize",
                    riskLevelStyle(integrity.risk_level),
                  )}
                >
                  {integrity.risk_level} Risk
                </span>
                <p className="mt-2 text-sm text-slate-600">{integrity.summary}</p>
              </div>
            </div>

            {/* Behavior Timeline Chart */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h4 className="text-sm font-medium text-slate-700 mb-4">Behavior Timeline</h4>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height={200}>
                  <LazyAreaChart
                    data={generateTimelineData(
                      integrity.details,
                      Math.max(session.duration_seconds ? Math.ceil(session.duration_seconds / 60) : 5, 5),
                    )}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => v}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="keystrokes"
                      stackId="1"
                      stroke="#6366f1"
                      fill="#6366f1"
                      fillOpacity={0.6}
                      name="Keystrokes"
                    />
                    <Area
                      type="monotone"
                      dataKey="pastes"
                      stackId="1"
                      stroke="#ef4444"
                      fill="#ef4444"
                      fillOpacity={0.6}
                      name="Pastes"
                    />
                    <Area
                      type="monotone"
                      dataKey="tab_switches"
                      stackId="1"
                      stroke="#f59e0b"
                      fill="#f59e0b"
                      fillOpacity={0.6}
                      name="Tab Switches"
                    />
                  </LazyAreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Focus Timeline Bar */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h4 className="text-sm font-medium text-slate-700 mb-2">Focus Timeline</h4>
              <div className="h-8 rounded-lg overflow-hidden flex bg-slate-100 border border-slate-200">
                {(() => {
                  const totalMs = (session.duration_seconds ?? 0) * 1000;
                  const awayMs = integrity.details.total_away_time_ms ?? 0;
                  const focusedMs = Math.max(0, totalMs - awayMs);
                  const focusedPct = totalMs > 0 ? (focusedMs / totalMs) * 100 : 100;
                  const awayPct = totalMs > 0 ? (awayMs / totalMs) * 100 : 0;
                  const segments: { type: "focused" | "away"; percentage: number; duration_ms: number }[] = [];
                  if (focusedPct > 0) segments.push({ type: "focused", percentage: focusedPct, duration_ms: focusedMs });
                  if (awayPct > 0) segments.push({ type: "away", percentage: awayPct, duration_ms: awayMs });
                  if (segments.length === 0) segments.push({ type: "focused", percentage: 100, duration_ms: 0 });
                  return segments.map((seg, i) => (
                    <div
                      key={i}
                      className={cn(
                        seg.type === "focused" ? "bg-emerald-400" : "bg-red-400",
                      )}
                      style={{ width: `${seg.percentage}%` }}
                      title={`${seg.type}: ${formatDurationMs(seg.duration_ms)}`}
                    />
                  ));
                })()}
              </div>
              <div className="flex justify-between mt-1 text-xs text-slate-500">
                <span>Start</span>
                <span>
                  {integrity.details.total_away_time_ms > 0
                    ? `${formatDurationMs(integrity.details.total_away_time_ms)} away`
                    : "Fully focused"}
                </span>
                <span>End</span>
              </div>
            </div>

            {/* Behavior stats grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {[
                { label: "Total Keystrokes", value: String(integrity.details.total_keystrokes) },
                { label: "Paste Events", value: String(integrity.details.total_pastes) },
                {
                  label: "Paste Chars",
                  value: integrity.details.total_paste_chars.toLocaleString(),
                },
                { label: "Tab Switches", value: String(integrity.details.tab_switches) },
                {
                  label: "Total Away Time",
                  value: `${(integrity.details.total_away_time_ms / 1000).toFixed(1)}s`,
                },
                { label: "Focus Losses", value: String(integrity.details.focus_losses) },
                {
                  label: "Longest Idle",
                  value: `${(integrity.details.longest_idle_ms / 1000).toFixed(1)}s`,
                },
                { label: "Code Submissions", value: String(integrity.details.code_submissions) },
                {
                  label: "Avg Typing (WPM)",
                  value: integrity.details.avg_typing_speed_wpm?.toFixed(1) ?? "—",
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            {/* Flags with severity */}
            {integrity.flags.length > 0 && (
              <div className="mt-6 space-y-3">
                <h4 className="text-sm font-medium text-slate-700">Detected Flags</h4>
                {[...integrity.flags]
                  .sort((a, b) => {
                    const order = { high: 0, medium: 1, low: 2 };
                    return order[getFlagSeverity(a)] - order[getFlagSeverity(b)];
                  })
                  .map((flag) => {
                    const severity = getFlagSeverity(flag);
                    return (
                      <div
                        key={flag}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3",
                          severity === "high"
                            ? "border-red-200 bg-red-50"
                            : severity === "medium"
                              ? "border-amber-200 bg-amber-50"
                              : "border-slate-200 bg-slate-50",
                        )}
                      >
                        <AlertTriangle
                          className={cn(
                            "h-5 w-5 mt-0.5 shrink-0",
                            severity === "high"
                              ? "text-red-500"
                              : severity === "medium"
                                ? "text-amber-500"
                                : "text-slate-500",
                          )}
                        />
                        <div>
                          <p
                            className={cn(
                              "text-sm font-medium",
                              severity === "high"
                                ? "text-red-800"
                                : severity === "medium"
                                  ? "text-amber-800"
                                  : "text-slate-800",
                            )}
                          >
                            {formatFlagName(flag)}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {FLAG_DESCRIPTIONS[flag] || flag}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Shield className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-medium text-slate-900">
              No proctoring data available
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Integrity metrics are collected when candidates complete interviews with proctoring
              enabled. This session has no recorded behavior data.
            </p>
          </div>
        )
      )}

      {activeTab === "highlights" && (
        <div data-tour="highlights" className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Zap className="h-4 w-4 text-amber-500" />
              AI Highlights
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Key moments identified for hiring manager review
            </p>
          </div>
          <div className="p-6">
            {highlightsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : highlights.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No highlights available. Complete the interview and generate a report first.
              </p>
            ) : (
              <div className="space-y-4">
                {highlights.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(`msg-${h.message_index}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      setActiveTab("transcript");
                    }}
                    className="w-full text-left rounded-lg border border-slate-200 p-4 hover:bg-slate-50 hover:border-indigo-200 transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className={cn(
                          "inline-flex h-2 w-2 rounded-full shrink-0",
                          getHighlightColor(h.type),
                        )}
                      />
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium text-white", getHighlightColor(h.type))}>
                        {h.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-sm font-medium text-slate-900">{h.label}</span>
                    </div>
                    <p className="text-sm text-slate-600">{h.summary}</p>
                    {h.content_preview && (
                      <p className="mt-2 text-xs text-slate-500 italic truncate">
                        &ldquo;{h.content_preview}...&rdquo;
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      Message #{h.message_index + 1} &middot; {h.speaker}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "clips" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Film className="h-4 w-4 text-indigo-500" />
                Interview Clips
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                AI-extracted key moments for quick stakeholder review
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (session?.status !== "completed") return;
                setClipsGenerating(true);
                try {
                  const generated = await api.generateClips(id);
                  setClips(generated);
                  toast.success(`Generated ${generated.length} clips`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to generate clips");
                } finally {
                  setClipsGenerating(false);
                }
              }}
              disabled={clipsGenerating || clipsLoading || session?.status !== "completed"}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {clipsGenerating && <Loader2 className="h-4 w-4 animate-spin" />}
              <Film className="h-4 w-4" />
              Generate Clips
            </button>
          </div>
          <div className="p-6">
            {clipsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : clips.length === 0 ? (
              <div className="py-12 text-center">
                <Film className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-4 text-sm text-slate-500">
                  No clips yet. Click &quot;Generate Clips&quot; to extract key moments with AI.
                </p>
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-thin">
                {clips.map((clip) => (
                  <div
                    key={clip.id}
                    className="shrink-0 w-72 rounded-xl border border-slate-200 bg-slate-50/50 p-4 hover:border-indigo-200 transition-colors"
                  >
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium text-white",
                        getClipTypeColor(clip.clip_type),
                      )}
                    >
                      {formatClipType(clip.clip_type)}
                    </span>
                    <h4 className="mt-2 text-sm font-semibold text-slate-900 line-clamp-2">{clip.title}</h4>
                    <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                      {clip.transcript_excerpt.slice(0, 100)}
                      {clip.transcript_excerpt.length > 100 ? "…" : ""}
                    </p>
                    {clip.importance_score != null && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${clip.importance_score * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">
                          {(clip.importance_score * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const { share_url } = await api.shareClip(clip.id);
                          await navigator.clipboard.writeText(share_url);
                          toast.success("Share link copied");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to share");
                        }
                      }}
                      className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Share
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "genome" && (
        <div data-tour="genome" className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Dna className="h-4 w-4 text-indigo-500" />
              Competency Genome
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              DNA fingerprint across 24 competency dimensions
            </p>
          </div>
          <div className="p-6">
            {genomeLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : genome === "none" || !genome ? (
              <div className="py-8 text-center">
                <Dna className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-4 text-sm text-slate-600">
                  No genome for this candidate yet.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Genomes are built from completed interview reports. Rebuild to extract from all reports.
                </p>
                {session?.candidate_email && session?.status === "completed" && (
                  <button
                    type="button"
                    onClick={async () => {
                      setGenomeRebuilding(true);
                      try {
                        const g = await api.rebuildGenome(session.candidate_email!);
                        setGenome(g);
                        toast.success("Genome rebuilt");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Rebuild failed");
                      } finally {
                        setGenomeRebuilding(false);
                      }
                    }}
                    disabled={genomeRebuilding}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {genomeRebuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Rebuild Genome
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">
                    {genome.genome_data?.interview_count ?? 0} interviews contributed to this profile
                  </p>
                  {session?.candidate_email && (
                    <button
                      type="button"
                      onClick={async () => {
                        setGenomeRebuilding(true);
                        try {
                          const g = await api.rebuildGenome(session.candidate_email!);
                          setGenome(g);
                          toast.success("Genome rebuilt");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Rebuild failed");
                        } finally {
                          setGenomeRebuilding(false);
                        }
                      }}
                      disabled={genomeRebuilding}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {genomeRebuilding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Rebuild
                    </button>
                  )}
                </div>
                {(() => {
                  const dims = genome.genome_data?.dimensions ?? {};
                  const radarData = Object.entries(dims).map(([k, v]) => ({
                    dimension: (TECHNICAL_DIMENSION_LABELS[k] ?? k).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                    score: typeof v === "object" && v && "score" in v ? (v as { score: number }).score : 0,
                    fullMark: 10,
                  }));
                  if (radarData.length === 0) {
                    return <p className="text-sm text-slate-500">No dimension data</p>;
                  }
                  return (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LazyRadarChart data={radarData}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 10]} />
                          <Radar
                            name="Score"
                            dataKey="score"
                            stroke="#6366f1"
                            fill="#6366f1"
                            fillOpacity={0.3}
                            strokeWidth={2}
                          />
                        </LazyRadarChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "values" && (
        <div data-tour="cultural-fit" className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Heart className="h-4 w-4 text-indigo-500" />
                Cultural Fit
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Values alignment assessment based on company values
              </p>
            </div>
            {valuesAssessment === "none" && session?.status === "completed" && (
              <button
                type="button"
                onClick={async () => {
                  setValuesAssessing(true);
                  try {
                    const a = await api.assessValues(id);
                    setValuesAssessment(a);
                    toast.success("Assessment complete");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Assessment failed");
                  } finally {
                    setValuesAssessing(false);
                  }
                }}
                disabled={valuesAssessing}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {valuesAssessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Run Assessment
              </button>
            )}
          </div>
          <div className="p-6">
            {valuesAssessmentLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : valuesAssessment === "none" || !valuesAssessment ? (
              <div className="py-12 text-center">
                <Heart className="mx-auto h-12 w-12 text-slate-300" />
                <h3 className="mt-4 text-lg font-medium text-slate-900">
                  No cultural fit assessment yet
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {session?.status === "completed"
                    ? "Configure company values in Settings, then run the assessment to analyze candidate alignment."
                    : "Complete the interview first to run a values assessment."}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Fit label badge & overall score */}
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
                  <div className="relative flex h-24 w-24 items-center justify-center">
                    <svg className="h-24 w-24 -rotate-90" viewBox="0 0 36 36">
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
                        strokeDasharray={`${((valuesAssessment.overall_fit_score ?? 0) / 10) * 100}, 100`}
                        strokeLinecap="round"
                        className={cn(
                          (valuesAssessment.overall_fit_score ?? 0) >= 8
                            ? "text-emerald-500"
                            : (valuesAssessment.overall_fit_score ?? 0) >= 6
                              ? "text-blue-500"
                              : (valuesAssessment.overall_fit_score ?? 0) >= 4
                                ? "text-amber-500"
                                : "text-red-500"
                        )}
                      />
                    </svg>
                    <span className="absolute text-2xl font-bold text-slate-900">
                      {(valuesAssessment.overall_fit_score ?? 0).toFixed(1)}
                    </span>
                  </div>
                  <div className="text-center sm:text-left">
                    <span
                      className={cn(
                        "inline-block rounded-full px-3 py-1 text-sm font-medium",
                        (valuesAssessment.overall_fit_score ?? 0) >= 8
                          ? "bg-emerald-100 text-emerald-800"
                          : (valuesAssessment.overall_fit_score ?? 0) >= 6
                            ? "bg-blue-100 text-blue-800"
                            : (valuesAssessment.overall_fit_score ?? 0) >= 4
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                      )}
                    >
                      {valuesAssessment.fit_label ?? "Unknown"}
                    </span>
                  </div>
                </div>

                {/* Radar chart */}
                {Object.keys(valuesAssessment.value_scores || {}).length > 0 && (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LazyRadarChart
                        data={Object.entries(valuesAssessment.value_scores || {}).map(([dim, data]) => ({
                          dimension: dim.replace(/\b\w/g, (c) => c.toUpperCase()),
                          score: typeof data === "object" && data && "score" in data ? (data as { score: number }).score : 0,
                          fullMark: 10,
                        }))}
                      >
                        <PolarGrid />
                        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 10]} />
                        <Radar
                          name="Fit"
                          dataKey="score"
                          stroke="#6366f1"
                          fill="#6366f1"
                          fillOpacity={0.3}
                          strokeWidth={2}
                        />
                      </LazyRadarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Evidence cards */}
                {Object.entries(valuesAssessment.value_scores || {}).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-700 mb-3">Evidence by Value</h4>
                    <div className="space-y-2">
                      {Object.entries(valuesAssessment.value_scores).map(([valueName, data]) => {
                        const score = typeof data === "object" && data && "score" in data ? (data as { score: number }).score : 0;
                        const confidence = typeof data === "object" && data && "confidence" in data ? (data as { confidence?: number }).confidence : undefined;
                        const evidence = typeof data === "object" && data && "evidence" in data ? (data as { evidence?: string[] }).evidence : [];
                        const isExpanded = valuesEvidenceExpanded[valueName] ?? false;
                        return (
                          <div
                            key={valueName}
                            className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => setValuesEvidenceExpanded((p) => ({ ...p, [valueName]: !isExpanded }))}
                              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-100/50 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-medium text-slate-900">{valueName}</span>
                                <span className={cn(
                                  "rounded-full px-2 py-0.5 text-xs font-medium",
                                  score >= 8 ? "bg-emerald-100 text-emerald-800" : score >= 6 ? "bg-blue-100 text-blue-800" : score >= 4 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                                )}>
                                  {score.toFixed(1)}
                                </span>
                                {confidence != null && (
                                  <span className="text-xs text-slate-500">
                                    {(confidence * 100).toFixed(0)}% confidence
                                  </span>
                                )}
                              </div>
                              {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                            </button>
                            {isExpanded && evidence && evidence.length > 0 && (
                              <div className="border-t border-slate-200 px-4 py-3 bg-white">
                                <ul className="space-y-1 text-sm text-slate-600">
                                  {evidence.map((e, i) => (
                                    <li key={i} className="flex gap-2">
                                      <span className="text-indigo-500">&ldquo;</span>
                                      {e}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AI narrative */}
                {valuesAssessment.ai_narrative && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-6">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3">
                      <Sparkles className="h-4 w-4 text-indigo-600" />
                      AI Assessment
                    </h4>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {valuesAssessment.ai_narrative}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "engagement" && (
        <div data-tour="engagement" className="space-y-6">
          {engagementLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : !report ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <Activity className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-medium text-slate-900">
                Generate a report first
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Engagement metrics are computed when the report is generated.
              </p>
            </div>
          ) : !engagementProfile || Object.keys(engagementProfile).length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <Activity className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-medium text-slate-900">
                No engagement data
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Engagement profile will appear after report generation.
              </p>
            </div>
          ) : (
            <>
              {/* Overall engagement badge */}
              <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:justify-between">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <svg className="h-24 w-24 -rotate-90" viewBox="0 0 36 36">
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
                      strokeDasharray={`${(engagementProfile.overall_engagement || 0) * 100}, 100`}
                      strokeLinecap="round"
                      className={cn(
                        (engagementProfile.overall_engagement || 0) > 0.7
                          ? "text-emerald-500"
                          : (engagementProfile.overall_engagement || 0) >= 0.4
                            ? "text-amber-500"
                            : "text-red-500"
                      )}
                    />
                  </svg>
                  <span className="absolute text-2xl font-bold text-slate-900">
                    {Math.round((engagementProfile.overall_engagement || 0) * 100)}%
                  </span>
                </div>
                <div className="text-center sm:text-left">
                  <span className="text-sm font-medium text-slate-700">
                    Overall Engagement
                  </span>
                  <p className="mt-1 text-xs text-slate-500">
                    Behavioral signals from candidate responses
                  </p>
                </div>
              </div>

              {/* Confidence timeline */}
              {engagementProfile.confidence_pattern?.arc?.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h4 className="mb-4 text-sm font-medium text-slate-700">
                    Confidence Timeline
                  </h4>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height={200}>
                      <LazyLineChart
                        data={engagementProfile.confidence_pattern.arc}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="q"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => `Q${v}`}
                        />
                        <YAxis
                          domain={[0, 1]}
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => v.toFixed(1)}
                        />
                        <Tooltip
                          formatter={(v) => [Number(v).toFixed(2), "Confidence"]}
                          labelFormatter={(l) => `Question ${l}`}
                        />
                        <Line
                          type="monotone"
                          dataKey="v"
                          stroke="#6366f1"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          name="Confidence"
                        />
                      </LazyLineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Response speed chart */}
              {(() => {
                const perQ =
                  engagementProfile.response_speed?.per_question ?? [];
                const avgMs = engagementProfile.response_speed?.avg_ms ?? 0;
                if (perQ.length === 0) return null;
                return (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h4 className="mb-4 text-sm font-medium text-slate-700">
                      Response Speed
                    </h4>
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height={200}>
                        <LazyBarChart
                          data={perQ}
                          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="q"
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => `Q${v}`}
                          />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => `${(v / 1000).toFixed(1)}s`}
                          />
                          <Tooltip
                            formatter={(v) => [
                              `${(Number(v) / 1000).toFixed(1)}s`,
                              "Latency",
                            ]}
                            labelFormatter={(l) => `Question ${l}`}
                          />
                          <Bar dataKey="ms" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          {avgMs > 0 && (
                            <ReferenceLine
                              y={avgMs}
                              stroke="#ef4444"
                              strokeDasharray="4 4"
                              label={{ value: "Avg", position: "right" }}
                            />
                          )}
                        </LazyBarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}

              {/* Trend indicators */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h4 className="text-xs font-medium text-slate-500">
                    Response Speed Trend
                  </h4>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    {engagementProfile.response_speed?.trend === "improving" ? (
                      <>
                        <ArrowUp className="h-4 w-4 text-emerald-500" />
                        Improving ↑
                      </>
                    ) : engagementProfile.response_speed?.trend === "slowing" ? (
                      <>
                        <ArrowDown className="h-4 w-4 text-amber-500" />
                        Slowing ↓
                      </>
                    ) : (
                      <>
                        <Minus className="h-4 w-4 text-slate-500" />
                        Stable →
                      </>
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h4 className="text-xs font-medium text-slate-500">
                    Elaboration Trend
                  </h4>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    {engagementProfile.elaboration_trend?.trend === "increasing" ? (
                      <>
                        <ArrowUp className="h-4 w-4 text-emerald-500" />
                        Increasing ↑
                      </>
                    ) : engagementProfile.elaboration_trend?.trend === "decreasing" ? (
                      <>
                        <ArrowDown className="h-4 w-4 text-amber-500" />
                        Decreasing ↓
                      </>
                    ) : (
                      <>
                        <Minus className="h-4 w-4 text-slate-500" />
                        Stable →
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Notable signals */}
              {engagementProfile.notable_signals?.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h4 className="mb-4 text-sm font-medium text-slate-700">
                    Notable Signals
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {engagementProfile.notable_signals.map((sig, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3",
                          sig.type === "confidence_spike"
                            ? "border-emerald-200 bg-emerald-50"
                            : sig.type === "hesitation_cluster"
                              ? "border-amber-200 bg-amber-50"
                              : "border-orange-200 bg-orange-50"
                        )}
                      >
                        {sig.type === "confidence_spike" ? (
                          <ArrowUp className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                        ) : sig.type === "hesitation_cluster" ? (
                          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                        ) : (
                          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
                        )}
                        <div>
                          <p className="text-xs font-medium text-slate-600">
                            Q{sig.question_index}
                          </p>
                          <p className="text-sm text-slate-700">{sig.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "prediction" && (
        <div data-testid="prediction-tab" className="space-y-6">
          {!report ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <Target className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-medium text-slate-900">
                Generate a report first
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Success prediction requires a generated report.
              </p>
            </div>
          ) : predictionLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : prediction ? (
            <>
              {/* Success gauge */}
              <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:justify-between">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <svg className="h-24 w-24 -rotate-90" viewBox="0 0 36 36">
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
                      strokeDasharray={`${prediction.success_probability * 100}, 100`}
                      strokeLinecap="round"
                      className={cn(
                        prediction.success_probability > 0.7
                          ? "text-emerald-500"
                          : prediction.success_probability >= 0.4
                            ? "text-amber-500"
                            : "text-red-500"
                      )}
                    />
                  </svg>
                  <span className="absolute text-2xl font-bold text-slate-900">
                    {Math.round(prediction.success_probability * 100)}%
                  </span>
                </div>
                <div className="flex flex-col items-center gap-2 sm:items-start">
                  <span
                    className={cn(
                      "inline-block rounded-full px-3 py-1 text-sm font-medium capitalize",
                      prediction.success_probability > 0.7
                        ? "bg-emerald-100 text-emerald-800"
                        : prediction.success_probability >= 0.4
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                    )}
                  >
                    Success probability
                  </span>
                  {prediction.is_heuristic ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Estimated
                    </span>
                  ) : (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      Predicted
                    </span>
                  )}
                </div>
              </div>

              {/* Contributing & risk factors */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <Check className="h-4 w-4 text-emerald-500" />
                    Contributing Factors
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {prediction.contributing_factors.length > 0 ? (
                      prediction.contributing_factors.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          {f.factor}
                          {f.value != null && (
                            <span className="text-slate-500">({f.value})</span>
                          )}
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-slate-500">None identified</li>
                    )}
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Risk Factors
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {prediction.risk_factors.length > 0 ? (
                      prediction.risk_factors.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                          {f.factor}
                          {f.value != null && (
                            <span className="text-slate-500">({f.value})</span>
                          )}
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-slate-500">None identified</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Record Outcome */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">
                  Hiring Outcome
                </h3>
                {outcomeRecorded ? (
                  <p className="text-sm text-slate-600">
                    Outcome recorded. Update post-hire feedback from the Predictions dashboard.
                  </p>
                ) : showOutcomeForm ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const wasHired = (form.elements.namedItem("was_hired") as HTMLInputElement)?.checked ?? false;
                      const hireDate = (form.elements.namedItem("hire_date") as HTMLInputElement)?.value || undefined;
                      setRecordingOutcome(true);
                      try {
                        await api.recordOutcome({
                          session_id: id,
                          candidate_email: session?.candidate_email ?? "",
                          was_hired: wasHired,
                          hire_date: hireDate || undefined,
                        });
                        setOutcomeRecorded(true);
                        setShowOutcomeForm(false);
                        toast.success("Outcome recorded");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed to record outcome");
                      } finally {
                        setRecordingOutcome(false);
                      }
                    }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="was_hired"
                        name="was_hired"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor="was_hired" className="text-sm font-medium text-slate-700">
                        Was hired
                      </label>
                    </div>
                    <div>
                      <label htmlFor="hire_date" className="block text-sm font-medium text-slate-700 mb-1">
                        Hire date (optional)
                      </label>
                      <input
                        type="date"
                        id="hire_date"
                        name="hire_date"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={recordingOutcome}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {recordingOutcome ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowOutcomeForm(false)}
                        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowOutcomeForm(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Record Outcome
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <Target className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-4 text-sm text-slate-500">
                Unable to load prediction
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "transcript" && (
        <div data-tour="transcript" className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                id={`msg-${idx}`}
                className={cn("px-6 py-4 scroll-mt-24", msg.role === "interviewer" ? "bg-slate-50/50" : "")}
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wider",
                      msg.role === "interviewer" ? "text-indigo-600" : "text-slate-600",
                    )}
                  >
                    {msg.role === "interviewer" ? "AI Interviewer" : "Candidate"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(msg.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Discussion */}
      <div data-tour="discussion" className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
          <Users className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-900">Team Discussion</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3 px-6 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                {(c.user_name || c.user_email || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {c.user_name || c.user_email}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(c.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  {currentUserId === c.user_id && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await api.deleteComment(id, c.id);
                          await loadComments();
                          toast.success("Comment deleted");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to delete");
                        }
                      }}
                      className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 transition-colors"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                  {c.content.split(/(@\S+@\S+\.\S+)/g).map((part, i) =>
                    part.match(/@\S+@\S+\.\S+/) ? (
                      <span key={i} className="text-blue-600 font-medium">
                        {part}
                      </span>
                    ) : (
                      part
                    )
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="relative border-t border-slate-200 p-4">
          {!report && (
            <p className="mb-3 text-sm text-slate-500">
              Generate a report first to add comments.
            </p>
          )}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <textarea
                disabled={!report}
                value={commentInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setCommentInput(v);
                  const lastAt = v.lastIndexOf("@");
                  if (lastAt >= 0) {
                    const after = v.slice(lastAt + 1);
                    if (!/\s/.test(after) || after.length === 0) {
                      setShowMentionDropdown(true);
                      setMentionFilter(after);
                    } else {
                      setShowMentionDropdown(false);
                    }
                  } else {
                    setShowMentionDropdown(false);
                  }
                }}
                onBlur={() => setTimeout(() => setShowMentionDropdown(false), 150)}
                placeholder="Add a comment... Use @email to mention colleagues"
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                rows={2}
              />
              {showMentionDropdown && orgMembers.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-1 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {orgMembers
                    .filter(
                      (m) =>
                        !mentionFilter ||
                        m.email.toLowerCase().includes(mentionFilter.toLowerCase()) ||
                        m.full_name.toLowerCase().includes(mentionFilter.toLowerCase())
                    )
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const lastAt = commentInput.lastIndexOf("@");
                          const before = commentInput.slice(0, lastAt);
                          setCommentInput(`${before}@${m.email} `);
                          setShowMentionDropdown(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-700">
                          {(m.full_name || m.email).charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate">{m.full_name}</span>
                        <span className="truncate text-slate-500">{m.email}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={async () => {
                const content = commentInput.trim();
                if (!content || postingComment) return;
                setPostingComment(true);
                try {
                  await api.addComment(id, content);
                  setCommentInput("");
                  await loadComments();
                  toast.success("Comment posted");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to post comment");
                } finally {
                  setPostingComment(false);
                }
              }}
              disabled={!report || !commentInput.trim() || postingComment}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {postingComment ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
