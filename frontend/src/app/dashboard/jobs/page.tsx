"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type JobPosting } from "@/lib/api";
import {
  Plus,
  Copy,
  Trash2,
  ExternalLink,
  Sparkles,
  ChevronDown,
  Loader2,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  };
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
  },
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const res = await api.getJobPostings();
      setJobs(res.items);
    } catch {
      /* handled by interceptor */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

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
      });
      setForm({ ...defaultForm });
      setShowForm(false);
      await loadJobs();
    } catch {
      /* toast on error */
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateLink(jobId: string) {
    try {
      const res = await api.generateInterviewLink(jobId);
      const fullUrl = `${window.location.origin}/interview/${res.token}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedToken(jobId);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      /* error */
    }
  }

  async function handleExtractSkills(jobId: string) {
    setExtracting(jobId);
    try {
      await api.extractSkills(jobId);
      await loadJobs();
    } catch {
      /* error */
    } finally {
      setExtracting(null);
    }
  }

  async function handleDelete(jobId: string) {
    if (!confirm("Delete this job posting?")) return;
    try {
      await api.deleteJobPosting(jobId);
      await loadJobs();
    } catch {
      /* error */
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
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Job
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Job Title
              </label>
              <input
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
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Role Type
              </label>
              <select
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Job Description
            </label>
            <textarea
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Required Skills (comma-separated)
              </label>
              <input
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
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Interview Format
              </label>
              <select
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
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Questions
              </label>
              <input
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
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Duration (min)
              </label>
              <input
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
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Difficulty
              </label>
              <select
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
                  <button
                    onClick={() => handleGenerateLink(job.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                  >
                    {copiedToken === job.id ? (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-3.5 w-3.5" />
                        Generate Link
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(job.id)}
                    className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
