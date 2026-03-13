"use client";

import { useState } from "react";
import { api, type JobPosting } from "@/lib/api";
import { Copy, Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type GenerateLinkModalProps = {
  open: boolean;
  onClose: () => void;
  job: JobPosting;
  getInterviewPath: (job: JobPosting | undefined, token: string) => string;
  onGenerated?: () => void;
};

export function GenerateLinkModal({
  open,
  onClose,
  job,
  getInterviewPath,
  onGenerated,
}: GenerateLinkModalProps) {
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    token: string;
    interview_url: string;
    ics_content?: string;
    scheduled_at?: string;
  } | null>(null);

  function reset() {
    setScheduleEnabled(false);
    setDate("");
    setTime("09:00");
    setCandidateName("");
    setCandidateEmail("");
    setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const data = scheduleEnabled
        ? {
            candidate_name: candidateName.trim() || undefined,
            candidate_email: candidateEmail.trim() || undefined,
            scheduled_at:
              date && time
                ? new Date(`${date}T${time}:00`).toISOString()
                : undefined,
          }
        : undefined;

      if (scheduleEnabled && (!date || !time || !candidateEmail.trim())) {
        toast.error("Please fill in date, time, and candidate email for scheduled interviews");
        setLoading(false);
        return;
      }

      const res = await api.generateInterviewLink(job.id, data);
      setResult(res);

      const path = getInterviewPath(job, res.token);
      const fullUrl = `${window.location.origin}${path}`;
      await navigator.clipboard.writeText(fullUrl);
      toast.success("Link generated and copied to clipboard");

      if (res.ics_content && candidateEmail) {
        toast.success("Invitation email sent to candidate");
      }
      onGenerated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate link");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadIcs() {
    if (!result?.ics_content) return;
    const blob = new Blob([result.ics_content], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-${job.title.replace(/\s+/g, "-")}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Calendar invite downloaded");
  }

  if (!open) return null;

  const fullUrl = result
    ? `${window.location.origin}${getInterviewPath(job, result.token)}`
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-link-title"
    >
      <div
        className="absolute inset-0 bg-slate-900/50"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 id="generate-link-title" className="text-lg font-semibold text-slate-900">
            Generate Interview Link
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            {result.scheduled_at && (
              <p className="text-sm text-slate-600">
                Scheduled for{" "}
                <strong>
                  {new Date(result.scheduled_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </strong>
              </p>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={fullUrl}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-slate-50"
              />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(fullUrl);
                  toast.success("Copied to clipboard");
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Copy className="h-4 w-4" />
                Copy
              </button>
            </div>
            {result.ics_content && (
              <button
                type="button"
                onClick={handleDownloadIcs}
                className="flex items-center gap-2 w-full justify-center rounded-lg bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                <Download className="h-4 w-4" />
                Download Calendar Invite (.ics)
              </button>
            )}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-slate-700">
                Schedule interview
              </span>
            </label>

            {scheduleEnabled && (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      required={scheduleEnabled}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Time
                    </label>
                    <input
                      type="time"
                      required={scheduleEnabled}
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Candidate name
                  </label>
                  <input
                    type="text"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Candidate email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required={scheduleEnabled}
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    placeholder="candidate@example.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Invitation email and calendar invite will be sent
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {scheduleEnabled ? "Generate & Send Invite" : "Generate Link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
