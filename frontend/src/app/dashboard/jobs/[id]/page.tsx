"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type JobPosting } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, FileText, Gauge, X } from "lucide-react";
import { toast } from "sonner";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish (Español)" },
  { code: "fr", label: "French (Français)" },
  { code: "de", label: "German (Deutsch)" },
  { code: "pt", label: "Portuguese (Português)" },
  { code: "hi", label: "Hindi (हिन्दी)" },
  { code: "zh", label: "Chinese (中文)" },
  { code: "ja", label: "Japanese (日本語)" },
  { code: "ko", label: "Korean (한국어)" },
  { code: "ar", label: "Arabic (العربية)" },
  { code: "it", label: "Italian (Italiano)" },
  { code: "nl", label: "Dutch (Nederlands)" },
  { code: "ru", label: "Russian (Русский)" },
  { code: "ta", label: "Tamil (தமிழ்)" },
  { code: "te", label: "Telugu (తెలుగు)" },
  { code: "kn", label: "Kannada (ಕನ್ನಡ)" },
];

type ScoringDimension = { dimension: string; weight: number; description: string };

type FormData = {
  title: string;
  role_type: string;
  job_description: string;
  required_skills: string;
  interview_format: string;
  interview_config: {
    num_questions: number;
    duration_minutes: number;
    difficulty: string;
    include_coding: boolean;
    language: string;
  };
  scoring_rubric: ScoringDimension[];
  decision_tree_id: string;
};

const defaultForm: FormData = {
  title: "",
  role_type: "mixed",
  job_description: "",
  required_skills: "",
  interview_format: "text",
  interview_config: {
    num_questions: 10,
    duration_minutes: 30,
    difficulty: "medium",
    include_coding: false,
    language: "en",
  },
  scoring_rubric: [],
  decision_tree_id: "",
};

const COMMON_DIMENSIONS: ScoringDimension[] = [
  { dimension: "Code Quality", weight: 0.25, description: "Clean code, naming, modularity" },
  { dimension: "Problem Solving", weight: 0.25, description: "Algorithmic thinking, edge cases" },
  { dimension: "Communication", weight: 0.2, description: "Clarity, structure, explanation" },
  { dimension: "System Design", weight: 0.2, description: "Architecture, scalability, trade-offs" },
  { dimension: "Cultural Fit", weight: 0.1, description: "Values alignment, teamwork" },
];

function jobToForm(job: JobPosting): FormData {
  const config = job.interview_config as {
    num_questions?: number;
    duration_minutes?: number;
    difficulty?: string;
    include_coding?: boolean;
    language?: string;
  } | undefined;
  const rubric = job.scoring_rubric;
  const scoring_rubric: ScoringDimension[] = Array.isArray(rubric)
    ? rubric.map((d) => ({
        dimension: d.dimension ?? "",
        weight: typeof d.weight === "number" ? d.weight : 0.2,
        description: d.description ?? "",
      }))
    : [];
  return {
    title: job.title,
    role_type: job.role_type,
    job_description: job.job_description,
    required_skills: Array.isArray(job.required_skills)
      ? job.required_skills.join(", ")
      : "",
    interview_format: job.interview_format,
    interview_config: {
      num_questions: config?.num_questions ?? 10,
      duration_minutes: config?.duration_minutes ?? 30,
      difficulty: config?.difficulty ?? "medium",
      include_coding: config?.include_coding ?? false,
      language: config?.language ?? "en",
    },
    scoring_rubric,
    decision_tree_id: job.decision_tree_id || "",
  };
}

export default function JobEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { hasRole } = useAuth();
  const canSaveTemplate = hasRole("admin", "hiring_manager");
  const [job, setJob] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormData>({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [decisionTrees, setDecisionTrees] = useState<Array<{ id: string; name: string; role_type: string | null; is_published: boolean }>>([]);

  useEffect(() => {
    if (!id) return;
    api
      .getJobPosting(id)
      .then((j) => {
        setJob(j);
        setForm(jobToForm(j));
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load job");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    api
      .listDecisionTrees()
      .then((list) => setDecisionTrees(list))
      .catch(() => setDecisionTrees([]));
  }, []);

  async function handleSaveAsTemplate() {
    if (!job) return;
    setSavingTemplate(true);
    try {
      await api.createTemplateFromJob(job.id);
      toast.success("Job saved as template");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateJobPosting(id, {
        title: form.title,
        role_type: form.role_type,
        job_description: form.job_description,
        required_skills: form.required_skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        interview_format: form.interview_format,
        decision_tree_id: form.decision_tree_id || null,
        interview_config: form.interview_config,
        scoring_rubric: form.scoring_rubric,
      });
      toast.success("Job updated successfully");
      router.push("/dashboard/jobs");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update job");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!job) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit Job Posting</h1>
          <p className="text-sm text-slate-500 mt-1">
            Update job details and interview configuration
          </p>
        </div>
        {canSaveTemplate && (
          <button
            type="button"
            onClick={handleSaveAsTemplate}
            disabled={savingTemplate}
            className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            {savingTemplate ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Save as Template
          </button>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="job-title" className="block text-sm font-medium text-slate-700 mb-1">
              Job Title
            </label>
            <input
              id="job-title"
              type="text"
              required
              minLength={3}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="Senior Backend Engineer"
            />
          </div>
          <div>
            <label htmlFor="role-type" className="block text-sm font-medium text-slate-700 mb-1">
              Role Type
            </label>
            <select
              id="role-type"
              value={form.role_type}
              onChange={(e) => setForm({ ...form, role_type: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              <option value="technical">Technical</option>
              <option value="non_technical">Non-Technical</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div>
            <label htmlFor="decision-tree" className="block text-sm font-medium text-slate-700 mb-1">
              Decision Tree (optional)
            </label>
            <select
              id="decision-tree"
              value={form.decision_tree_id}
              onChange={(e) => setForm({ ...form, decision_tree_id: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              <option value="">None</option>
              {decisionTrees
                .filter((t) => t.is_published && (!t.role_type || t.role_type === form.role_type))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="job-description" className="block text-sm font-medium text-slate-700 mb-1">
            Job Description
          </label>
          <textarea
            id="job-description"
            required
            minLength={50}
            rows={5}
            value={form.job_description}
            onChange={(e) =>
              setForm({ ...form, job_description: e.target.value })
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="Paste the full job description here..."
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="required-skills" className="block text-sm font-medium text-slate-700 mb-1">
              Required Skills (comma-separated)
            </label>
            <input
              id="required-skills"
              type="text"
              value={form.required_skills}
              onChange={(e) =>
                setForm({ ...form, required_skills: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="Python, FastAPI, PostgreSQL"
            />
          </div>
            <div>
              <label htmlFor="interview-format" className="block text-sm font-medium text-slate-700 mb-1">
                Interview Format
              </label>
              <select
                id="interview-format"
                value={form.interview_format}
                onChange={(e) =>
                  setForm({ ...form, interview_format: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                <option value="text">Text Chat</option>
                <option value="voice">Voice</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div>
              <label htmlFor="language" className="block text-sm font-medium text-slate-700 mb-1">
                Language
              </label>
              <select
                id="language"
                value={form.interview_config.language}
                onChange={(e) =>
                  setForm({
                    ...form,
                    interview_config: {
                      ...form.interview_config,
                      language: e.target.value,
                    },
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="num-questions" className="block text-sm font-medium text-slate-700 mb-1">
              Questions
            </label>
            <input
              id="num-questions"
              type="number"
              min={3}
              max={30}
              value={form.interview_config.num_questions}
              onChange={(e) =>
                setForm({
                  ...form,
                  interview_config: {
                    ...form.interview_config,
                    num_questions: Number(e.target.value),
                  },
                })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label htmlFor="duration-minutes" className="block text-sm font-medium text-slate-700 mb-1">
              Duration (min)
            </label>
            <input
              id="duration-minutes"
              type="number"
              min={10}
              max={120}
              value={form.interview_config.duration_minutes}
              onChange={(e) =>
                setForm({
                  ...form,
                  interview_config: {
                    ...form.interview_config,
                    duration_minutes: Number(e.target.value),
                  },
                })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label htmlFor="difficulty" className="block text-sm font-medium text-slate-700 mb-1">
              Difficulty
            </label>
            <select
              id="difficulty"
              value={form.interview_config.difficulty}
              onChange={(e) =>
                setForm({
                  ...form,
                  interview_config: {
                    ...form.interview_config,
                    difficulty: e.target.value,
                  },
                })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
            <Gauge className="h-4 w-4" />
            Custom Scoring Rubric (Optional)
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Leave empty to use default AI scoring rubric
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {COMMON_DIMENSIONS.map((dim, i) => (
              <button
                key={i}
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    scoring_rubric: [...form.scoring_rubric, { ...dim }],
                  })
                }
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                + {dim.dimension}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                scoring_rubric: [
                  ...form.scoring_rubric,
                  { dimension: "", weight: 0.2, description: "" },
                ],
              })
            }
            className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors mb-3"
          >
            + Add Dimension
          </button>
          {form.scoring_rubric.length > 0 && (
            <div className="space-y-2">
              {form.scoring_rubric.map((dim, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3"
                >
                  <input
                    type="text"
                    placeholder="Dimension name"
                    value={dim.dimension}
                    onChange={(e) => {
                      const next = [...form.scoring_rubric];
                      next[idx] = { ...next[idx], dimension: e.target.value };
                      setForm({ ...form, scoring_rubric: next });
                    }}
                    className="flex-1 min-w-[120px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                  <div className="flex items-center gap-1">
                    <label className="text-xs text-slate-500">Weight</label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={dim.weight}
                      onChange={(e) => {
                        const next = [...form.scoring_rubric];
                        next[idx] = {
                          ...next[idx],
                          weight: Math.max(0, Math.min(1, Number(e.target.value))),
                        };
                        setForm({ ...form, scoring_rubric: next });
                      }}
                      className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Description"
                    value={dim.description}
                    onChange={(e) => {
                      const next = [...form.scoring_rubric];
                      next[idx] = { ...next[idx], description: e.target.value };
                      setForm({ ...form, scoring_rubric: next });
                    }}
                    className="flex-1 min-w-[160px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        scoring_rubric: form.scoring_rubric.filter(
                          (_, i) => i !== idx
                        ),
                      })
                    }
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    aria-label="Remove dimension"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <p className="text-xs text-slate-500">
                Total weight:{" "}
                {form.scoring_rubric
                  .reduce((s, d) => s + d.weight, 0)
                  .toFixed(2)}
                {form.scoring_rubric.reduce((s, d) => s + d.weight, 0) !== 1 &&
                  " (consider normalizing to 1.0)"}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/jobs")}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
