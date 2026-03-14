"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type AccessibilityConfig } from "@/lib/api";
import {
  Send,
  Loader2,
  Clock,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  FileText,
  Upload,
  Star,
  Sparkles,
  Target,
  TrendingUp,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InterviewPhase } from "@/lib/types";
import { WalkthroughProvider } from "@/components/walkthrough/walkthrough-provider";
import { useWalkthrough } from "@/hooks/use-walkthrough";

type ChatMessage = { role: "interviewer" | "candidate"; content: string };

type CoachingReport = Awaited<ReturnType<typeof api.getCoachingReport>>;

function PracticeCompleteView({
  token,
  elapsed,
  formatTime,
}: {
  token: string;
  elapsed: number;
  formatTime: (s: number) => string;
}) {
  const router = useRouter();
  const [report, setReport] = useState<CoachingReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  const handleGetReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getCoachingReport(token);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const readinessColor = (score: number) => {
    if (score >= 86) return "text-emerald-400";
    if (score >= 70) return "text-green-400";
    if (score >= 40) return "text-amber-400";
    return "text-red-400";
  };

  const readinessBg = (score: number) => {
    if (score >= 86) return "bg-emerald-500/10 border-emerald-500/20";
    if (score >= 70) return "bg-green-500/10 border-green-500/20";
    if (score >= 40) return "bg-amber-500/10 border-amber-500/20";
    return "bg-red-500/10 border-red-500/20";
  };

  const priorityBadge = (p: string) => {
    const styles: Record<string, string> = {
      high: "bg-red-500/10 text-red-400",
      medium: "bg-amber-500/10 text-amber-400",
      low: "bg-blue-500/10 text-blue-400",
    };
    return styles[p] || styles.medium;
  };

  const scoreColor = (s: number) => {
    if (s >= 8) return "text-emerald-400";
    if (s >= 6) return "text-green-400";
    if (s >= 4) return "text-amber-400";
    return "text-red-400";
  };

  if (!report) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-400" />
          <h2 className="mt-4 text-xl font-bold text-white">
            Practice Complete!
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Get a personalized AI coaching report with actionable feedback.
          </p>
          {elapsed > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Duration: {formatTime(elapsed)}
            </p>
          )}
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
          <button
            onClick={handleGetReport}
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 px-8 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing Your Performance...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Get AI Coaching Report
              </>
            )}
          </button>
          <button
            onClick={() => router.push("/practice")}
            className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-8 py-3 text-sm font-medium text-slate-300 transition-colors"
          >
            Practice Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-16">
      {/* Header */}
      <div className="max-w-3xl mx-auto px-4 pt-8">
        <div className="flex items-center gap-2 text-sm text-indigo-400 mb-4">
          <Sparkles className="h-4 w-4" />
          AI Interview Coach
        </div>
        <h1 className="text-2xl font-bold">Your Coaching Report</h1>
        <p className="text-slate-400 mt-1">
          {report.job_title} &middot; {report.candidate_name}
        </p>
      </div>

      {/* Readiness Score */}
      <div className="max-w-3xl mx-auto px-4 mt-6">
        <div
          className={`rounded-xl border p-6 text-center ${readinessBg(report.readiness_score)}`}
        >
          <p className="text-sm text-slate-400 uppercase tracking-wider">
            Interview Readiness
          </p>
          <p className={`text-5xl font-bold mt-2 ${readinessColor(report.readiness_score)}`}>
            {report.readiness_score}
            <span className="text-lg text-slate-500">/100</span>
          </p>
          <p className={`mt-1 text-sm font-medium ${readinessColor(report.readiness_score)}`}>
            {report.readiness_label}
          </p>
          <p className="mt-3 text-sm text-slate-400 max-w-lg mx-auto">
            {report.summary}
          </p>
        </div>
      </div>

      {/* Question-by-Question Feedback */}
      <div className="max-w-3xl mx-auto px-4 mt-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <MessageSquare className="h-5 w-5 text-indigo-400" />
          Question-by-Question Feedback
        </h2>
        <div className="space-y-3">
          {report.question_feedback.map((qf, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden"
            >
              <button
                onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`text-lg font-bold ${scoreColor(qf.score)}`}
                  >
                    {qf.score}
                  </span>
                  <span className="text-sm text-slate-300 truncate">
                    {qf.question_summary}
                  </span>
                </div>
                {expandedQ === i ? (
                  <ChevronUp className="h-4 w-4 text-slate-500 flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-500 flex-shrink-0" />
                )}
              </button>
              {expandedQ === i && (
                <div className="px-4 pb-4 space-y-3 border-t border-slate-800">
                  <div className="pt-3">
                    <p className="text-xs font-medium text-emerald-400 uppercase mb-1">
                      What went well
                    </p>
                    <p className="text-sm text-slate-300">{qf.what_went_well}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-amber-400 uppercase mb-1">
                      What to improve
                    </p>
                    <p className="text-sm text-slate-300">
                      {qf.what_to_improve}
                    </p>
                  </div>
                  {qf.sample_answer_snippet && (
                    <div className="rounded-lg bg-slate-800 p-3">
                      <p className="text-xs font-medium text-indigo-400 uppercase mb-1">
                        Sample stronger answer
                      </p>
                      <p className="text-sm text-slate-300 italic">
                        &ldquo;{qf.sample_answer_snippet}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Strengths */}
      <div className="max-w-3xl mx-auto px-4 mt-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Target className="h-5 w-5 text-emerald-400" />
          Your Strengths
        </h2>
        <div className="space-y-3">
          {report.strengths.map((s, i) => (
            <div
              key={i}
              className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"
            >
              <p className="font-medium text-emerald-400">{s.title}</p>
              <p className="text-sm text-slate-400 mt-1">{s.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Areas to Improve */}
      <div className="max-w-3xl mx-auto px-4 mt-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-amber-400" />
          Areas to Improve
        </h2>
        <div className="space-y-3">
          {report.improvements.map((imp, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-800 bg-slate-900 p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium text-white">{imp.title}</p>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${priorityBadge(imp.priority)}`}
                >
                  {imp.priority}
                </span>
              </div>
              <p className="text-sm text-slate-400">{imp.detail}</p>
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-indigo-500/10 p-2.5">
                <Sparkles className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-indigo-300">{imp.tip}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Study Plan */}
      {report.study_plan && report.study_plan.length > 0 && (
        <div className="max-w-3xl mx-auto px-4 mt-8">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <BookOpen className="h-5 w-5 text-blue-400" />
            Personalized Study Plan
          </h2>
          <div className="space-y-3">
            {report.study_plan.map((item, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-800 bg-slate-900 p-4"
              >
                <p className="font-medium text-white flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-blue-400" />
                  {item.topic}
                </p>
                <p className="text-sm text-slate-400 mt-1 ml-6">
                  {item.reason}
                </p>
                <p className="text-sm text-blue-300 mt-1 ml-6">
                  {item.resources}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STAR Method Tips */}
      {report.star_method_tips && report.star_method_tips.length > 0 && (
        <div className="max-w-3xl mx-auto px-4 mt-8">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Star className="h-5 w-5 text-amber-400" />
            STAR Method Tips
          </h2>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
            {report.star_method_tips.map((tip, i) => (
              <p key={i} className="text-sm text-slate-300 flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                {tip}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="max-w-3xl mx-auto px-4 mt-8 flex gap-3">
        <button
          onClick={() => router.push("/practice")}
          className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-sm font-medium text-white transition-colors"
        >
          Practice Again
        </button>
        <a
          href="/signup"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-6 py-3 text-sm font-medium text-slate-300 text-center transition-colors"
        >
          Create Free Account
        </a>
      </div>
    </div>
  );
}

function InterviewContent() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { startTourIfNew } = useWalkthrough();
  const [phase, setPhase] = useState<InterviewPhase>("loading");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [interviewConfig, setInterviewConfig] = useState<Record<string, unknown>>({});
  const [branding, setBranding] = useState<{
    logo_url?: string;
    primary_color?: string;
    company_name?: string;
    tagline?: string;
  } | null>(null);
  const [error, setError] = useState("");

  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeUploaded, setResumeUploaded] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(10);
  const [elapsed, setElapsed] = useState(0);
  const [tabSwitches, setTabSwitches] = useState(0);

  const [reconnecting, setReconnecting] = useState(false);
  const [, setReconnectFailed] = useState(false);
  const [isPractice, setIsPractice] = useState(false);

  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [overallRating, setOverallRating] = useState(0);
  const [fairnessRating, setFairnessRating] = useState(0);
  const [clarityRating, setClarityRating] = useState(0);
  const [relevanceRating, setRelevanceRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");

  const [showAccessibilityModal, setShowAccessibilityModal] = useState(false);
  const [accessibilityPrefs, setAccessibilityPrefs] = useState<AccessibilityConfig>({
    mode: "standard",
    preferences: {
      extended_time: false,
      time_multiplier: 1.5,
      screen_reader_optimized: false,
      high_contrast: false,
      dyslexia_friendly_font: false,
      large_text: false,
      reduced_motion: false,
      keyboard_only_navigation: false,
    },
    accommodations_notes: "",
  });
  const [cssOverrides, setCssOverrides] = useState<Record<string, string> | null>(null);
  const [accessibilityApplying, setAccessibilityApplying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalCloseRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interviewActiveRef = useRef(false);

  const primaryColor = branding?.primary_color || "#4F46E5";

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getPublicInterview(token);
        const practice = Boolean(data.is_practice);
        setIsPractice(practice);

        if (data.status === "completed") {
          setPhase("completed");
          return;
        }
        const config = (data.interview_config as Record<string, unknown>) || {};
        const includeCoding = config.include_coding === true;
        const format = (data.format as string) || "text";
        if (includeCoding) {
          router.replace(`/interview/${token}/code`);
          return;
        }
        if (format === "voice") {
          router.replace(`/interview/${token}/voice`);
          return;
        }
        if (format === "video") {
          router.replace(`/interview/${token}/video`);
          return;
        }
        setJobTitle(data.job_title as string || "");
        setJobDescription(data.job_description as string || "");
        setInterviewConfig(config);
        setTotal((config.num_questions as number) || 10);
        setBranding(
          (data.branding as { logo_url?: string; primary_color?: string; company_name?: string; tagline?: string }) ?? null,
        );
        if (practice) {
          setPhase("ready");
        } else {
          setPhase("consent");
        }
      } catch {
        setError("Interview not found or link expired.");
        setPhase("error");
      }
    }
    load();
  }, [token, router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    const overrides = cssOverrides;
    if (overrides && Object.keys(overrides).length > 0) {
      Object.entries(overrides).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value);
      });
    }
    return () => {
      if (overrides) {
        Object.keys(overrides).forEach((key) => {
          document.documentElement.style.removeProperty(key);
        });
      }
    };
  }, [cssOverrides]);

  useEffect(() => {
    if (phase === "interview" && messages.length > 0 && !thinking) {
      inputRef.current?.focus();
    }
  }, [phase, messages, thinking]);

  useEffect(() => {
    if (phase === "consent" || phase === "interview") {
      startTourIfNew("candidate-interview");
    }
  }, [phase, startTourIfNew]);

  useEffect(() => {
    function handleVisibility() {
      if (document.hidden && phase === "interview") {
        setTabSwitches((p) => p + 1);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [phase]);

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setResumeError("Only PDF files are accepted");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setResumeError("File too large (max 5 MB)");
      return;
    }
    setResumeError(null);
    setResumeUploading(true);
    try {
      const result = await api.uploadResume(token, file);
      setResumeUploaded(result.filename);
    } catch {
      setResumeError("Upload failed. You can continue without a resume.");
    } finally {
      setResumeUploading(false);
    }
  }

  async function handleConsent(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.startInterview(token, {
        candidate_name: candidateName,
        candidate_email: candidateEmail,
      });
      setPhase("ready");
    } catch {
      setError("Failed to start interview.");
      setPhase("error");
    }
  }

  const connectWebSocket = useCallback(() => {
    intentionalCloseRef.current = false;
    const wsUrl =
      (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8001") +
      `/ws/interview/${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    ws.onopen = () => {
      setReconnecting(false);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "question" || data.type === "code_review") {
        setMessages((m) => [...m, { role: "interviewer", content: data.content }]);
        setThinking(false);
        setProgress(data.progress || 0);
        setTotal(data.total || 10);
      } else if (data.type === "practice_complete") {
        if (data.content) {
          setMessages((m) => [...m, { role: "interviewer", content: data.content }]);
        }
        setIsPractice(true);
        intentionalCloseRef.current = true;
        interviewActiveRef.current = false;
        setPhase("completed");
        ws.close();
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (data.type === "thinking") {
        setThinking(true);
      } else if (data.type === "end") {
        if (data.content) {
          setMessages((m) => [...m, { role: "interviewer", content: data.content }]);
        }
        intentionalCloseRef.current = true;
        interviewActiveRef.current = false;
        setPhase("completed");
        ws.close();
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (data.type === "error") {
        intentionalCloseRef.current = true;
        interviewActiveRef.current = false;
        setError(data.content);
        setPhase("error");
        ws.close();
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };

    ws.onerror = () => {};

    ws.onclose = (event) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (intentionalCloseRef.current) return;
      if (event.code === 1000) return;
      if (!interviewActiveRef.current) return;

      const maxAttempts = 3;
      const delays = [1000, 2000, 4000];
      if (reconnectAttemptsRef.current >= maxAttempts) {
        interviewActiveRef.current = false;
        setReconnectFailed(true);
        setError("Connection lost. Please try again.");
        setPhase("error");
        return;
      }

      const delay = delays[reconnectAttemptsRef.current];
      reconnectAttemptsRef.current += 1;
      setReconnecting(true);
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectWebSocket();
      }, delay);
    };
  }, [token]);

  function startInterview() {
    setShowAccessibilityModal(false);
    setPhase("interview");
    interviewActiveRef.current = true;
    connectWebSocket();
  }

  async function handleApplyAccessibility() {
    if (!token) return;
    setAccessibilityApplying(true);
    try {
      await api.updateAccessibilityConfig(token, {
        ...accessibilityPrefs,
        mode: accessibilityPrefs.preferences.extended_time ||
          accessibilityPrefs.preferences.screen_reader_optimized ||
          accessibilityPrefs.preferences.high_contrast ||
          accessibilityPrefs.preferences.dyslexia_friendly_font ||
          accessibilityPrefs.preferences.large_text ||
          accessibilityPrefs.preferences.reduced_motion ||
          accessibilityPrefs.preferences.keyboard_only_navigation
          ? "accessible"
          : "standard",
      });
      const overrides = await api.getAccessibilityCssOverrides(token);
      setCssOverrides(overrides);
      startInterview();
    } catch {
      setError("Failed to apply accessibility settings.");
    } finally {
      setAccessibilityApplying(false);
    }
  }

  function handleSkipAccessibility() {
    startInterview();
  }

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, []);

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !wsRef.current || thinking) return;

    const text = input.trim();
    setMessages((m) => [...m, { role: "candidate", content: text }]);
    wsRef.current.send(JSON.stringify({ type: "message", content: text }));
    setInput("");
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }

  if (phase === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
          <h2 className="mt-4 text-xl font-bold text-white">
            Something went wrong
          </h2>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-slate-600 bg-slate-800 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "completed") {
    if (isPractice) {
      return (
        <PracticeCompleteView
          token={token}
          elapsed={elapsed}
          formatTime={formatTime}
        />
      );
    }

    const handleFeedbackSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (overallRating < 1 || !token) return;
      setFeedbackLoading(true);
      setFeedbackError(null);
      try {
        await api.submitFeedback(token, {
          overall_rating: overallRating,
          ...(fairnessRating > 0 && { fairness_rating: fairnessRating }),
          ...(clarityRating > 0 && { clarity_rating: clarityRating }),
          ...(relevanceRating > 0 && { relevance_rating: relevanceRating }),
          ...(feedbackComment.trim() && { comment: feedbackComment.trim() }),
        });
        setFeedbackSubmitted(true);
      } catch {
        setFeedbackError("Failed to submit feedback. Please try again.");
      } finally {
        setFeedbackLoading(false);
      }
    };

    const StarRating = ({
      value,
      onChange,
      size = "sm",
    }: {
      value: number;
      onChange: (v: number) => void;
      size?: "sm" | "md";
    }) => {
      const sizeClass = size === "md" ? "h-8 w-8" : "h-5 w-5";
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i)}
              className="p-0.5 transition-colors hover:scale-110"
              aria-label={`${i} star${i > 1 ? "s" : ""}`}
            >
              <Star
                className={cn(
                  sizeClass,
                  value >= i ? "text-amber-400 fill-amber-400" : "text-slate-600",
                )}
              />
            </button>
          ))}
        </div>
      );
    };

    if (feedbackSubmitted) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
          <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-400" />
            <h2 className="mt-4 text-xl font-bold text-white">
              Thank you!
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Your feedback has been recorded. We appreciate you taking the time
              to help us improve.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8">
          <CheckCircle className="mx-auto h-12 w-12 text-green-400" />
          <h2 className="mt-4 text-xl font-bold text-white text-center">
            Interview Complete
          </h2>
          <p className="mt-2 text-sm text-slate-400 text-center">
            Thank you for completing the interview! How was your experience?
          </p>
          {elapsed > 0 && (
            <p className="mt-3 text-xs text-slate-500 text-center">
              Duration: {formatTime(elapsed)}
            </p>
          )}
          <form onSubmit={handleFeedbackSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Overall experience (required)
              </label>
              <StarRating value={overallRating} onChange={setOverallRating} size="md" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Fairness
              </label>
              <StarRating value={fairnessRating} onChange={setFairnessRating} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Clarity
              </label>
              <StarRating value={clarityRating} onChange={setClarityRating} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Relevance
              </label>
              <StarRating value={relevanceRating} onChange={setRelevanceRating} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Comments (optional)
              </label>
              <textarea
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                placeholder="Any additional feedback?"
              />
            </div>
            {feedbackError && (
              <p className="text-xs text-red-400">{feedbackError}</p>
            )}
            <button
              type="submit"
              disabled={feedbackLoading || overallRating < 1}
              className="w-full rounded-lg py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              {feedbackLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : (
                "Submit Feedback"
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (phase === "consent") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-8">
          <div className="flex items-center gap-3 mb-6">
            {branding?.logo_url ? (
              <img
                src={branding.logo_url}
                alt={branding.company_name || "Logo"}
                className="h-10 w-10 rounded-xl object-contain"
              />
            ) : (
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: primaryColor }}
              >
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-white">
                {branding?.company_name || "InterviewBot"}
              </h1>
              <p className="text-xs text-slate-400">
                {branding?.tagline || "AI-Powered Interview"}
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-xl bg-slate-800/50 p-4">
            <h2 className="font-semibold text-white">{jobTitle}</h2>
            <p className="mt-1 text-sm text-slate-400 line-clamp-3">
              {jobDescription}
            </p>
          </div>

          <form data-tour="consent-form" onSubmit={handleConsent} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="jane@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Resume (optional)
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Upload your resume to get personalized questions. PDF only, max 5
                MB.
              </p>
              <div className="flex items-center gap-3">
                <label className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-800/50 px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleResumeUpload}
                    disabled={resumeUploading}
                    className="hidden"
                  />
                  {resumeUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                  ) : resumeUploaded ? (
                    <FileText className="h-4 w-4 text-green-400" />
                  ) : (
                    <Upload className="h-4 w-4 text-slate-400" />
                  )}
                  <span className="text-sm text-slate-400">
                    {resumeUploading
                      ? "Uploading..."
                      : resumeUploaded
                        ? "Resume uploaded"
                        : "Choose PDF"}
                  </span>
                </label>
              </div>
              {resumeError && (
                <p className="mt-1 text-xs text-red-400">{resumeError}</p>
              )}
            </div>

            <div className="rounded-lg bg-slate-800/50 p-3 text-xs text-slate-400">
              <p className="font-medium text-slate-300 mb-1">
                Before you begin:
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>This is an AI-powered interview session</li>
                <li>Your responses will be recorded and analyzed</li>
                <li>Tab switches are monitored during the interview</li>
                <li>
                  Estimated duration:{" "}
                  {(interviewConfig as Record<string, number>)?.duration_minutes || 30}{" "}
                  minutes
                </li>
              </ul>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg py-2.5 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: primaryColor }}
            >
              I Agree &mdash; Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-white"
        >
          Skip to main content
        </a>
        <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
          <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-indigo-400" />
            <h2 className="mt-4 text-xl font-bold text-white">Ready to Begin</h2>
            <p className="mt-2 text-sm text-slate-400">
              Click start when you&apos;re ready. The AI interviewer will ask you
              {" "}{total} questions about the role.
            </p>
            <button
              onClick={() => setShowAccessibilityModal(true)}
              className="mt-6 rounded-lg bg-indigo-600 px-8 py-3 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              aria-label="Start interview"
            >
              Start Interview
            </button>
          </div>
        </div>

        {showAccessibilityModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80"
            role="dialog"
            aria-modal="true"
            aria-labelledby="accessibility-modal-title"
            aria-describedby="accessibility-modal-desc"
          >
            <div
              className="absolute inset-0"
              onClick={() => setShowAccessibilityModal(false)}
              aria-hidden="true"
            />
            <div
              className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowAccessibilityModal(false);
              }}
            >
              <h2 id="accessibility-modal-title" className="text-xl font-bold text-white">
                Accessibility Options
              </h2>
              <p id="accessibility-modal-desc" className="mt-2 text-sm text-slate-400">
                We want to ensure a comfortable interview experience for everyone.
              </p>

              <div className="mt-6 space-y-4">
                <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 p-3 hover:bg-slate-800/50">
                  <span className="text-sm text-slate-300">Extended time</span>
                  <input
                    type="checkbox"
                    checked={accessibilityPrefs.preferences.extended_time}
                    onChange={(e) =>
                      setAccessibilityPrefs((p) => ({
                        ...p,
                        preferences: {
                          ...p.preferences,
                          extended_time: e.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500"
                    aria-label="Enable extended time"
                  />
                </label>
                {accessibilityPrefs.preferences.extended_time && (
                  <div className="ml-4">
                    <label className="block text-xs text-slate-400 mb-1">
                      Time multiplier: {accessibilityPrefs.preferences.time_multiplier}x
                    </label>
                    <input
                      type="range"
                      min={1.5}
                      max={2}
                      step={0.5}
                      value={accessibilityPrefs.preferences.time_multiplier}
                      onChange={(e) =>
                        setAccessibilityPrefs((p) => ({
                          ...p,
                          preferences: {
                            ...p.preferences,
                            time_multiplier: parseFloat(e.target.value),
                          },
                        }))
                      }
                      className="w-full"
                      aria-label="Time multiplier"
                    />
                  </div>
                )}
                <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 p-3 hover:bg-slate-800/50">
                  <span className="text-sm text-slate-300">Screen reader optimized</span>
                  <input
                    type="checkbox"
                    checked={accessibilityPrefs.preferences.screen_reader_optimized}
                    onChange={(e) =>
                      setAccessibilityPrefs((p) => ({
                        ...p,
                        preferences: {
                          ...p.preferences,
                          screen_reader_optimized: e.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500"
                    aria-label="Screen reader optimized"
                  />
                </label>
                <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 p-3 hover:bg-slate-800/50">
                  <span className="text-sm text-slate-300">High contrast mode</span>
                  <input
                    type="checkbox"
                    checked={accessibilityPrefs.preferences.high_contrast}
                    onChange={(e) =>
                      setAccessibilityPrefs((p) => ({
                        ...p,
                        preferences: {
                          ...p.preferences,
                          high_contrast: e.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500"
                    aria-label="High contrast mode"
                  />
                </label>
                <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 p-3 hover:bg-slate-800/50">
                  <span className="text-sm text-slate-300">Dyslexia-friendly font</span>
                  <input
                    type="checkbox"
                    checked={accessibilityPrefs.preferences.dyslexia_friendly_font}
                    onChange={(e) =>
                      setAccessibilityPrefs((p) => ({
                        ...p,
                        preferences: {
                          ...p.preferences,
                          dyslexia_friendly_font: e.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500"
                    aria-label="Dyslexia-friendly font"
                  />
                </label>
                <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 p-3 hover:bg-slate-800/50">
                  <span className="text-sm text-slate-300">Large text</span>
                  <input
                    type="checkbox"
                    checked={accessibilityPrefs.preferences.large_text}
                    onChange={(e) =>
                      setAccessibilityPrefs((p) => ({
                        ...p,
                        preferences: {
                          ...p.preferences,
                          large_text: e.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500"
                    aria-label="Large text"
                  />
                </label>
                <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 p-3 hover:bg-slate-800/50">
                  <span className="text-sm text-slate-300">Reduced motion</span>
                  <input
                    type="checkbox"
                    checked={accessibilityPrefs.preferences.reduced_motion}
                    onChange={(e) =>
                      setAccessibilityPrefs((p) => ({
                        ...p,
                        preferences: {
                          ...p.preferences,
                          reduced_motion: e.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500"
                    aria-label="Reduced motion"
                  />
                </label>
                <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 p-3 hover:bg-slate-800/50">
                  <span className="text-sm text-slate-300">Keyboard-only navigation</span>
                  <input
                    type="checkbox"
                    checked={accessibilityPrefs.preferences.keyboard_only_navigation}
                    onChange={(e) =>
                      setAccessibilityPrefs((p) => ({
                        ...p,
                        preferences: {
                          ...p.preferences,
                          keyboard_only_navigation: e.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500"
                    aria-label="Keyboard-only navigation"
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={handleApplyAccessibility}
                  disabled={accessibilityApplying}
                  className="w-full rounded-lg py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}
                  aria-label="Apply accessibility settings and start interview"
                >
                  {accessibilityApplying ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Applying...
                    </span>
                  ) : (
                    "Apply & Start"
                  )}
                </button>
                <button
                  onClick={handleSkipAccessibility}
                  disabled={accessibilityApplying}
                  className="w-full rounded-lg border border-slate-600 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
                  aria-label="I don't need accommodations, start interview"
                >
                  I don&apos;t need accommodations
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>
      {reconnecting && (
        <div className="bg-amber-600/90 text-white text-center py-2 text-sm font-medium">
          Reconnecting...
        </div>
      )}
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-3">
          {branding?.logo_url ? (
            <img
              src={branding.logo_url}
              alt={branding.company_name || ""}
              className="h-8 w-8 rounded-lg object-contain"
            />
          ) : (
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: primaryColor }}
            >
              <MessageSquare className="h-4 w-4 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-sm font-semibold text-white">{jobTitle}</h1>
            <p className="text-xs text-slate-500">
              {branding?.company_name || "AI Interview"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div data-tour="interview-timer" className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            {formatTime(elapsed)}
          </div>
          <div data-tour="progress-indicator" className="text-xs text-slate-500">
            Q {progress}/{total}
          </div>
          {tabSwitches > 0 && (
            <div className="flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {tabSwitches} tab switch{tabSwitches > 1 ? "es" : ""}
            </div>
          )}
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-slate-800">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${(progress / total) * 100}%`,
            backgroundColor: primaryColor,
          }}
        />
      </div>

      {/* Messages */}
      <main
        id="main-content"
        role="main"
        data-tour="chat-interface"
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
        aria-label="Interview chat"
      >
        <div
          className="max-w-3xl mx-auto space-y-4"
          role="log"
          aria-live="polite"
          aria-label="Interview messages"
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                msg.role === "candidate" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                  msg.role === "candidate"
                    ? "text-white rounded-br-sm"
                    : "bg-slate-800 text-slate-200 rounded-bl-sm",
                )}
                style={
                  msg.role === "candidate"
                    ? { backgroundColor: primaryColor }
                    : undefined
                }
              >
                {msg.content}
              </div>
            </div>
          ))}

          {thinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-800 px-4 py-3 rounded-bl-sm">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* Input */}
      <div className="border-t border-slate-800 px-4 py-4">
        <form
          onSubmit={sendMessage}
          className="max-w-3xl mx-auto flex items-center gap-3"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={thinking}
            placeholder={thinking ? "Waiting for response..." : "Type your answer..."}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50"
            autoFocus
            aria-label="Type your answer"
          />
          <button
            type="submit"
            disabled={thinking || !input.trim()}
            className="rounded-xl p-3 text-white disabled:opacity-50 transition-colors"
            style={{ backgroundColor: primaryColor }}
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CandidateInterviewPage() {
  return (
    <WalkthroughProvider>
      <InterviewContent />
    </WalkthroughProvider>
  );
}
