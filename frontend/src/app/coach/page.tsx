"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Target,
  TrendingUp,
  BookOpen,
  MessageSquare,
  ArrowRight,
  CheckCircle,
  Loader2,
} from "lucide-react";

const FEATURES = [
  {
    icon: Target,
    title: "Readiness Score",
    description:
      "Get a 0-100 score assessing how prepared you are for your next interview, with a clear label from 'Needs Work' to 'Outstanding'.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    icon: MessageSquare,
    title: "Question-by-Question Feedback",
    description:
      "Every answer scored individually. See what went well, what to improve, and sample stronger answers.",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
  },
  {
    icon: TrendingUp,
    title: "Prioritized Improvements",
    description:
      "Actionable improvement areas ranked by impact — high, medium, low — each with a concrete tip you can apply immediately.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    icon: BookOpen,
    title: "Personalized Study Plan",
    description:
      "Topics to focus on based on your actual weaknesses, with specific practice exercises tailored to your role.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
];

const STEPS = [
  {
    step: "1",
    title: "Take a Practice Interview",
    description: "Choose a role and complete a free 5-question AI interview.",
  },
  {
    step: "2",
    title: "Get Your Coaching Report",
    description:
      "After completing the practice, click 'Get AI Coaching Report' for instant analysis.",
  },
  {
    step: "3",
    title: "Improve and Repeat",
    description:
      "Follow your personalized study plan, then practice again to track progress.",
  },
];

export default function CoachPage() {
  const router = useRouter();
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenValue, setTokenValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleViewReport = () => {
    if (!tokenValue.trim()) return;
    setLoading(true);
    setError("");
    router.push(`/interview/${tokenValue.trim()}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 text-sm text-indigo-400 mb-6">
          <Sparkles className="h-4 w-4" />
          AI Interview Coach
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Ace Your Next Interview
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Practice with our AI interviewer, then get a detailed coaching report
          with personalized feedback, readiness scores, and a study plan —
          completely free.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => router.push("/practice")}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-8 py-3 font-semibold transition-colors flex items-center gap-2"
          >
            <Sparkles className="h-5 w-5" />
            Start Practice Interview
          </button>
          <button
            onClick={() => setShowTokenInput(!showTokenInput)}
            className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-8 py-3 font-semibold text-slate-300 transition-colors"
          >
            View Existing Report
          </button>
        </div>

        {showTokenInput && (
          <div className="mt-4 max-w-sm mx-auto">
            <div className="flex gap-2">
              <input
                type="text"
                value={tokenValue}
                onChange={(e) => setTokenValue(e.target.value)}
                placeholder="Enter your interview token"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
              />
              <button
                onClick={handleViewReport}
                disabled={loading || !tokenValue.trim()}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-center mb-10">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div
              key={s.step}
              className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center"
            >
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-indigo-500/10 text-indigo-400 font-bold text-lg mb-4">
                {s.step}
              </div>
              <h3 className="font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-slate-400">{s.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What You Get */}
      <div className="bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-center mb-10">
            What Your Report Includes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-slate-800 bg-slate-900 p-6"
              >
                <div
                  className={`inline-flex items-center justify-center h-10 w-10 rounded-lg ${f.bg} mb-4`}
                >
                  <f.icon className={`h-5 w-5 ${f.color}`} />
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sample Report Preview */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-center mb-10">
          Sample Coaching Report
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
              <p className="text-3xl font-bold text-emerald-400">78</p>
              <p className="text-xs text-slate-400 mt-1">Readiness Score</p>
            </div>
            <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-4 text-center">
              <p className="text-3xl font-bold text-indigo-400">5/5</p>
              <p className="text-xs text-slate-400 mt-1">Questions Analyzed</p>
            </div>
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 text-center">
              <p className="text-3xl font-bold text-amber-400">3</p>
              <p className="text-xs text-slate-400 mt-1">Study Topics</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg bg-slate-800 p-3">
              <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Clear Problem Decomposition</p>
                <p className="text-xs text-slate-400">
                  Broke down the system design into manageable components
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-slate-800 p-3">
              <TrendingUp className="h-5 w-5 text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Add Metrics to Answers</p>
                <p className="text-xs text-slate-400">
                  Quantify impact — &ldquo;reduced latency by 40%&rdquo; is stronger than
                  &ldquo;improved performance&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-4xl mx-auto px-4 pb-16 text-center">
        <button
          onClick={() => router.push("/practice")}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-10 py-4 text-lg font-semibold transition-colors"
        >
          Start Your Free Practice Now
        </button>
        <p className="mt-3 text-sm text-slate-500">
          No sign-up required · 5 questions · ~15 minutes
        </p>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-800 py-8 text-center text-sm text-slate-500">
        Powered by Hire with Giri -{" "}
        <a href="/signup" className="text-indigo-400 hover:underline">
          Create your free account
        </a>{" "}
        to interview candidates
      </div>
    </div>
  );
}
