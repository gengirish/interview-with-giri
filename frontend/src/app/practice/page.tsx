"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  Loader2,
  Sparkles,
  Code,
  Users,
  Brain,
  Monitor,
  Server,
  Cloud,
} from "lucide-react";

interface PracticeTemplate {
  id: string;
  name: string;
  role_type: string;
  description: string;
}

const BUILTIN_TEMPLATES: PracticeTemplate[] = [
  {
    id: "builtin-swe",
    name: "Software Engineer",
    role_type: "technical",
    description: "Full-stack software engineering interview",
  },
  {
    id: "builtin-pm",
    name: "Product Manager",
    role_type: "non_technical",
    description: "Product management behavioral interview",
  },
  {
    id: "builtin-ds",
    name: "Data Scientist",
    role_type: "technical",
    description: "Data science and ML interview",
  },
  {
    id: "builtin-fe",
    name: "Frontend Developer",
    role_type: "technical",
    description: "React/TypeScript frontend interview",
  },
  {
    id: "builtin-be",
    name: "Backend Developer",
    role_type: "technical",
    description: "Python/Node.js backend interview",
  },
  {
    id: "builtin-devops",
    name: "DevOps Engineer",
    role_type: "technical",
    description: "Infrastructure and CI/CD interview",
  },
];

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "builtin-swe": Code,
  "builtin-pm": Users,
  "builtin-ds": Brain,
  "builtin-fe": Monitor,
  "builtin-be": Server,
  "builtin-devops": Cloud,
};

export default function PracticePage() {
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleStart = async () => {
    if (!selectedTemplate) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.startPractice({
        template_id: selectedTemplate,
        candidate_name: candidateName || "Practice User",
      });
      router.push(`/interview/${result.token}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to start practice",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 text-sm text-indigo-400 mb-6">
          <Sparkles className="h-4 w-4" />
          Free AI Interview Practice
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Practice Your Interview
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Get real-time coaching from our AI interviewer. Practice as many times
          as you want. No sign-up required.
        </p>
      </div>

      {/* Template Selection */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        <h2 className="text-lg font-semibold mb-4">Choose a role to practice</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {BUILTIN_TEMPLATES.map((tmpl) => {
            const Icon = ICONS[tmpl.id] || Code;
            return (
              <button
                key={tmpl.id}
                onClick={() => setSelectedTemplate(tmpl.id)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  selectedTemplate === tmpl.id
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-slate-800 bg-slate-900 hover:border-slate-700"
                }`}
              >
                <Icon
                  className={`h-8 w-8 mb-3 ${
                    selectedTemplate === tmpl.id
                      ? "text-indigo-400"
                      : "text-slate-500"
                  }`}
                />
                <h3 className="font-semibold">{tmpl.name}</h3>
                <p className="text-sm text-slate-400 mt-1">{tmpl.description}</p>
                <span
                  className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${
                    tmpl.role_type === "technical"
                      ? "bg-blue-500/10 text-blue-400"
                      : "bg-green-500/10 text-green-400"
                  }`}
                >
                  {tmpl.role_type === "technical" ? "Technical" : "Behavioral"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Name + Start */}
      {selectedTemplate && (
        <div className="max-w-4xl mx-auto px-4 pb-16">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Your Name (optional)
            </label>
            <input
              type="text"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              placeholder="Enter your name"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none mb-4"
            />
            {error && (
              <p className="text-red-400 text-sm mb-4">{error}</p>
            )}
            <button
              onClick={handleStart}
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-3 font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Starting Practice...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Start Practice Interview
                </>
              )}
            </button>
            <p className="text-xs text-slate-500 mt-3 text-center">
              5 questions - ~15 minutes - With AI coaching tips
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-slate-800 py-8 text-center text-sm text-slate-500">
        Powered by AI Interview Bot -{" "}
        <a href="/signup" className="text-indigo-400 hover:underline">
          Create your free account
        </a>{" "}
        to interview candidates
      </div>
    </div>
  );
}
