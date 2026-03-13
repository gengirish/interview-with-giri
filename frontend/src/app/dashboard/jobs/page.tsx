"use client";

import { useEffect, useState, useCallback } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GenerateLinkModal } from "@/components/generate-link-modal";
import { ImportJobsModal } from "@/components/import-jobs-modal";
import { api, type JobPosting } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus,
  Trash2,
  ExternalLink,
  Sparkles,
  Loader2,
  Briefcase,
  Upload,
  Pencil,
  FileText,
  X,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

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
};

const COMMON_DIMENSIONS: ScoringDimension[] = [
  { dimension: "Code Quality", weight: 0.25, description: "Clean code, naming, modularity" },
  { dimension: "Problem Solving", weight: 0.25, description: "Algorithmic thinking, edge cases" },
  { dimension: "Communication", weight: 0.2, description: "Clarity, structure, explanation" },
  { dimension: "System Design", weight: 0.2, description: "Architecture, scalability, trade-offs" },
  { dimension: "Cultural Fit", weight: 0.1, description: "Values alignment, teamwork" },
];

export default function JobsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "hiring_manager");
  const canDelete = hasRole("admin");
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [generateLinkJob, setGenerateLinkJob] = useState<JobPosting | null>(null);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<
    Array<{
      id: string;
      name: string;
      description: string | null;
      role_type: string;
      job_description_template: string | null;
      required_skills: string[];
      interview_config: Record<string, unknown>;
      interview_format: string;
      is_system: boolean;
    }>
  >([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleTypeFilter, setRoleTypeFilter] = useState<string>("");
  const [interviewFormatFilter, setInterviewFormatFilter] = useState<string>("");
  const [isActiveFilter, setIsActiveFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const perPage = 20;

  const loadJobs = useCallback(async () => {
    try {
      const filters: { q?: string; is_active?: boolean; role_type?: string; interview_format?: string } = {};
      if (searchQuery.trim()) filters.q = searchQuery.trim();
      if (roleTypeFilter) filters.role_type = roleTypeFilter;
      if (interviewFormatFilter) filters.interview_format = interviewFormatFilter;
      if (isActiveFilter === "active") filters.is_active = true;
      if (isActiveFilter === "inactive") filters.is_active = false;
      const res = await api.getJobPostings(page, Object.keys(filters).length ? filters : undefined);
      setJobs(res.items);
      setTotalPages(Math.max(1, Math.ceil(res.total / (res.per_page || perPage))));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, roleTypeFilter, interviewFormatFilter, isActiveFilter]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  async function loadTemplates() {
    setTemplatesLoading(true);
    try {
      const list = await api.getTemplates();
      setTemplates(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setTemplatesLoading(false);
    }
  }

  function handleUseTemplate(
    t: (typeof templates)[0],
  ) {
    const config = t.interview_config as {
      num_questions?: number;
      duration_minutes?: number;
      difficulty?: string;
      include_coding?: boolean;
      language?: string;
    };
    setForm({
      ...form,
      title: "",
      role_type: t.role_type,
      job_description: t.job_description_template ?? "",
      required_skills: Array.isArray(t.required_skills)
        ? t.required_skills.join(", ")
        : "",
      interview_format: t.interview_format,
      interview_config: {
        num_questions: config?.num_questions ?? 10,
        duration_minutes: config?.duration_minutes ?? 30,
        difficulty: config?.difficulty ?? "medium",
        include_coding: config?.include_coding ?? false,
        language: config?.language ?? "en",
      },
    });
    setShowTemplates(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createJobPosting({
        title: form.title,
        role_type: form.role_type,
        job_description: form.job_description,
        required_skills: form.required_skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        interview_format: form.interview_format,
        interview_config: form.interview_config,
        scoring_rubric: form.scoring_rubric,
      });
      setForm({ ...defaultForm });
      setShowForm(false);
      await loadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setSaving(false);
    }
  }

  function getInterviewPath(job: JobPosting | undefined, token: string): string {
    if (!job) return `/interview/${token}`;
    const includeCoding = (job.interview_config?.include_coding as boolean) === true;
    if (includeCoding) return `/interview/${token}/code`;
    if (job.interview_format === "voice") return `/interview/${token}/voice`;
    if (job.interview_format === "video") return `/interview/${token}/video`;
    return `/interview/${token}`;
  }

  function getLinkLabel(job: JobPosting | undefined): string {
    if (!job) return "Generate Link";
    const includeCoding = (job.interview_config?.include_coding as boolean) === true;
    if (includeCoding) return "Code Interview Link";
    if (job.interview_format === "voice") return "Voice Interview Link";
    if (job.interview_format === "video") return "Video Interview Link";
    return "Text Interview Link";
  }

  function handleOpenGenerateLink(job: JobPosting) {
    setGenerateLinkJob(job);
  }

  async function handleExtractSkills(jobId: string) {
    setExtracting(jobId);
    try {
      await api.extractSkills(jobId);
      await loadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to extract skills");
    } finally {
      setExtracting(null);
    }
  }

  async function handleDelete(jobId: string) {
    try {
      await api.deleteJobPosting(jobId);
      await loadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete job");
    } finally {
      setDeleteJobId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Postings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage positions and generate interview links
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Job
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <input
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="flex-1 min-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          />
          <select
            value={roleTypeFilter}
            onChange={(e) => {
              setRoleTypeFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value="">All Role Types</option>
            <option value="technical">Technical</option>
            <option value="non_technical">Non-Technical</option>
            <option value="mixed">Mixed</option>
          </select>
          <select
            value={interviewFormatFilter}
            onChange={(e) => {
              setInterviewFormatFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value="">All Formats</option>
            <option value="text">Text</option>
            <option value="voice">Voice</option>
            <option value="video">Video</option>
          </select>
          <select
            value={isActiveFilter}
            onChange={(e) => {
              setIsActiveFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <h3 className="text-lg font-medium text-slate-900">Create Job Posting</h3>
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setShowTemplates(true);
                  if (templates.length === 0) loadTemplates();
                }}
                className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                <FileText className="h-4 w-4" />
                Use Template
              </button>
            )}
          </div>

          {showTemplates && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-700">Choose a template</h4>
                <button
                  type="button"
                  onClick={() => setShowTemplates(false)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-200 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {templatesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                </div>
              ) : (
                <div className="grid gap-2 max-h-48 overflow-y-auto">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleUseTemplate(t)}
                      className="flex flex-col items-start rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{t.name}</span>
                        {t.is_system && (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                            System
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <p className="mt-0.5 text-sm text-slate-500 line-clamp-2">
                          {t.description}
                        </p>
                      )}
                      <span className="mt-1 text-xs text-indigo-600 font-medium">
                        Use this template →
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
              Create Job
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Briefcase className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">
            No job postings yet
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Create your first job posting to start interviewing candidates.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {job.title}
                    </h3>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        job.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {job.is_active ? "Active" : "Inactive"}
                    </span>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                      {job.interview_format}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {job.role_type}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500 line-clamp-2">
                    {job.job_description}
                  </p>
                  {job.required_skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {job.required_skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {canEdit && (
                    <Link
                      href={`/dashboard/jobs/${job.id}`}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      title="Edit job"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Link>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => handleExtractSkills(job.id)}
                      disabled={extracting === job.id}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                      title="AI extract skills from JD"
                    >
                      {extracting === job.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      Extract Skills
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => handleOpenGenerateLink(job)}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {getLinkLabel(job)}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => setDeleteJobId(job.id)}
                      aria-label="Delete job posting"
                      className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-slate-50 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-slate-50 transition-colors"
          >
            Next
          </button>
        </div>
      )}

      <ConfirmDialog
        open={deleteJobId !== null}
        onConfirm={() => deleteJobId && handleDelete(deleteJobId)}
        onCancel={() => setDeleteJobId(null)}
        title="Delete job posting"
        description="Are you sure you want to delete this job posting? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />

      <ImportJobsModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={loadJobs}
      />

      <GenerateLinkModal
        open={generateLinkJob !== null}
        onClose={() => setGenerateLinkJob(null)}
        job={generateLinkJob!}
        getInterviewPath={getInterviewPath}
      />
    </div>
  );
}
