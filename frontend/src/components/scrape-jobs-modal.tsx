"use client";

import { useCallback, useState } from "react";
import {
  Search,
  Globe,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  MapPin,
  Building2,
  Calendar,
  ChevronLeft,
  Download,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type ScrapedJob } from "@/lib/api";

interface ScrapeJobsModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Step = "search" | "select" | "configure" | "results";

type ImportResult = {
  total: number;
  created: number;
  errors: number;
  results: Array<{
    index: number;
    title: string;
    status: string;
    error?: string;
    extracted_skills?: string[];
  }>;
};

export function ScrapeJobsModal({
  open,
  onClose,
  onImported,
}: ScrapeJobsModalProps) {
  const [step, setStep] = useState<Step>("search");
  const [searchTerms, setSearchTerms] = useState("");
  const [location, setLocation] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [scrapedJobs, setScrapedJobs] = useState<ScrapedJob[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [roleType, setRoleType] = useState("mixed");
  const [interviewFormat, setInterviewFormat] = useState("text");
  const [autoExtractSkills, setAutoExtractSkills] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult | null>(null);
  const [page, setPage] = useState(1);

  const reset = useCallback(() => {
    setStep("search");
    setSearchTerms("");
    setLocation("");
    setSearching(false);
    setSearchError("");
    setScrapedJobs([]);
    setSelectedIds(new Set());
    setRoleType("mixed");
    setInterviewFormat("text");
    setAutoExtractSkills(false);
    setImporting(false);
    setImportResults(null);
    setPage(1);
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!searchTerms.trim()) return;
    setSearching(true);
    setSearchError("");
    try {
      const res = await api.scrapeJobs({
        search_terms: searchTerms.trim(),
        location: location.trim() || undefined,
        page,
      });
      setScrapedJobs(res.jobs);
      setSelectedIds(new Set());
      if (res.jobs.length === 0) {
        setSearchError("No jobs found. Try different search terms or location.");
      } else {
        setStep("select");
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Search failed. Please try again."
      );
    } finally {
      setSearching(false);
    }
  }

  function toggleJob(jobId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === scrapedJobs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(scrapedJobs.map((j) => j.job_id)));
    }
  }

  async function handleImport() {
    const selected = scrapedJobs.filter((j) => selectedIds.has(j.job_id));
    if (selected.length === 0) return;
    setImporting(true);
    try {
      const res = await api.importScrapedJobs({
        jobs: selected,
        role_type: roleType,
        interview_format: interviewFormat,
        auto_extract_skills: autoExtractSkills,
      });
      setImportResults(res);
      setStep("results");
      if (res.created > 0) {
        onImported();
      }
    } catch (err) {
      setImportResults({
        total: selected.length,
        created: 0,
        errors: selected.length,
        results: [
          {
            index: 0,
            title: "Import failed",
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
          },
        ],
      });
      setStep("results");
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            {step !== "search" && step !== "results" && (
              <button
                onClick={() =>
                  setStep(step === "configure" ? "select" : "search")
                }
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div className="rounded-lg bg-indigo-50 p-2">
              <Globe className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Scrape Jobs
              </h2>
              <p className="text-sm text-slate-500">
                {step === "search" && "Search job boards to find postings"}
                {step === "select" && `${scrapedJobs.length} jobs found — select to import`}
                {step === "configure" && `Import ${selectedIds.size} selected jobs`}
                {step === "results" && "Import complete"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Step 1: Search */}
          {step === "search" && (
            <>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-600">
                  Search across LinkedIn, Indeed, Glassdoor, ZipRecruiter and
                  more. Results from the RapidAPI Job Search service.
                </p>
              </div>

              <form onSubmit={handleSearch} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Job Title / Keywords <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerms}
                      onChange={(e) => setSearchTerms(e.target.value)}
                      placeholder="e.g. Senior Python Developer"
                      className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Location{" "}
                    <span className="text-xs text-slate-400">(optional)</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. San Francisco, CA"
                      className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                {searchError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {searchError}
                  </div>
                )}
              </form>
            </>
          )}

          {/* Step 2: Select Jobs */}
          {step === "select" && (
            <>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size === scrapedJobs.length &&
                      scrapedJobs.length > 0
                    }
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Select all ({scrapedJobs.length})
                </label>
                <span className="text-sm text-slate-500">
                  {selectedIds.size} selected
                </span>
              </div>

              <div className="space-y-2">
                {scrapedJobs.map((job) => (
                  <label
                    key={job.job_id}
                    className={cn(
                      "flex gap-3 rounded-xl border p-4 cursor-pointer transition-colors",
                      selectedIds.has(job.job_id)
                        ? "border-indigo-300 bg-indigo-50/50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(job.job_id)}
                      onChange={() => toggleJob(job.job_id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-medium text-slate-900 truncate">
                          {job.job_title}
                        </h4>
                        {job.job_url && (
                          <a
                            href={job.job_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex-shrink-0 text-slate-400 hover:text-indigo-600"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {job.company_name && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {job.company_name}
                          </span>
                        )}
                        {job.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {job.location}
                          </span>
                        )}
                        {job.posted_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {job.posted_date}
                          </span>
                        )}
                      </div>
                      {job.snippet && (
                        <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">
                          {job.snippet}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Step 3: Configure Import */}
          {step === "configure" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-indigo-50 px-4 py-3">
                <p className="text-sm text-indigo-700">
                  <span className="font-medium">{selectedIds.size}</span> job
                  {selectedIds.size !== 1 ? "s" : ""} will be imported with the
                  settings below.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Role Type
                  </label>
                  <select
                    value={roleType}
                    onChange={(e) => setRoleType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    <option value="technical">Technical</option>
                    <option value="non_technical">Non-Technical</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Interview Format
                  </label>
                  <select
                    value={interviewFormat}
                    onChange={(e) => setInterviewFormat(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    <option value="text">Text</option>
                    <option value="voice">Voice</option>
                    <option value="video">Video</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={autoExtractSkills}
                  onChange={(e) => setAutoExtractSkills(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Auto-extract skills with AI
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Uses AI to extract required skills from each job description
                    after import
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Step 4: Import Results */}
          {step === "results" && importResults && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 rounded-lg bg-slate-50 px-4 py-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-900">
                    {importResults.total}
                  </div>
                  <div className="text-xs text-slate-500">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {importResults.created}
                  </div>
                  <div className="text-xs text-slate-500">Created</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {importResults.errors}
                  </div>
                  <div className="text-xs text-slate-500">Errors</div>
                </div>
              </div>

              {importResults.results.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                          Title
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                          Status
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                          Skills
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importResults.results.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-xs text-slate-900 max-w-[200px] truncate">
                            {r.title || "—"}
                          </td>
                          <td className="px-3 py-2">
                            {r.status === "created" ? (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Created
                              </span>
                            ) : (
                              <span
                                className="flex items-center gap-1 text-xs text-red-600"
                                title={r.error}
                              >
                                <AlertCircle className="h-3.5 w-3.5" />
                                {r.error || "Error"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500 max-w-[200px] truncate">
                            {r.extracted_skills?.join(", ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          {step === "search" && (
            <>
              <button
                onClick={handleClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSearch()}
                disabled={!searchTerms.trim() || searching}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {searching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Search Jobs
                  </>
                )}
              </button>
            </>
          )}

          {step === "select" && (
            <>
              <button
                onClick={() => {
                  setStep("search");
                  setScrapedJobs([]);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                New Search
              </button>
              <button
                onClick={() => setStep("configure")}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                Import {selectedIds.size} Job{selectedIds.size !== 1 ? "s" : ""}
              </button>
            </>
          )}

          {step === "configure" && (
            <>
              <button
                onClick={() => setStep("select")}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Confirm Import
                  </>
                )}
              </button>
            </>
          )}

          {step === "results" && (
            <>
              <button
                onClick={reset}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Scrape More
              </button>
              <button
                onClick={handleClose}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
