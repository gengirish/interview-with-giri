"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type JobPosting } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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

function jobToForm(job: JobPosting): FormData {
  const config = job.interview_config as {
    num_questions?: number;
    duration_minutes?: number;
    difficulty?: string;
    include_coding?: boolean;
  } | undefined;
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
    },
  };
}

export default function JobEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [job, setJob] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormData>({ ...defaultForm });
  const [saving, setSaving] = useState(false);

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
        interview_config: form.interview_config,
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Edit Job Posting</h1>
        <p className="text-sm text-slate-500 mt-1">
          Update job details and interview configuration
        </p>
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

        <div className="grid grid-cols-2 gap-4">
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
