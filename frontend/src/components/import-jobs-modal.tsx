"use client";

import { useCallback, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  Download,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

type ImportResult = {
  row: number;
  title?: string;
  status: string;
  error?: string;
};

interface ImportJobsModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const TEMPLATE_COLUMNS = [
  "title",
  "role_type",
  "job_description",
  "required_skills",
  "interview_format",
  "num_questions",
  "duration_minutes",
  "difficulty",
  "include_coding",
];

const SAMPLE_ROWS = [
  [
    "Senior Backend Engineer",
    "technical",
    "We are looking for a senior backend engineer with 5+ years of experience in Python, FastAPI, and PostgreSQL. Must have strong system design skills.",
    "Python, FastAPI, PostgreSQL, Docker",
    "text",
    "10",
    "30",
    "medium",
    "false",
  ],
  [
    "Product Manager",
    "non_technical",
    "Seeking an experienced product manager to lead our SaaS platform roadmap. Must be data-driven with strong stakeholder communication skills.",
    "Product Strategy, Analytics, Agile, Roadmap Planning",
    "video",
    "8",
    "45",
    "medium",
    "false",
  ],
];

export function ImportJobsModal({ open, onClose, onImported }: ImportJobsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{
    total_rows: number;
    created: number;
    errors: number;
    results: ImportResult[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setResults(null);
    setImporting(false);
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && isValidFile(dropped)) {
      setFile(dropped);
      setResults(null);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected && isValidFile(selected)) {
      setFile(selected);
      setResults(null);
    }
    e.target.value = "";
  }

  function isValidFile(f: File): boolean {
    const ext = f.name.split(".").pop()?.toLowerCase();
    return ext === "csv" || ext === "xlsx";
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    try {
      const res = await api.importJobPostings(file);
      setResults(res);
      if (res.created > 0) {
        onImported();
      }
    } catch (err) {
      setResults({
        total_rows: 0,
        created: 0,
        errors: 1,
        results: [
          {
            row: 0,
            status: "error",
            error: err instanceof Error ? err.message : "Import failed",
          },
        ],
      });
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const header = TEMPLATE_COLUMNS.join(",");
    const rows = SAMPLE_ROWS.map((row) =>
      row.map((cell) => (cell.includes(",") ? `"${cell}"` : cell)).join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "job_postings_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2">
              <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Import Job Postings</h2>
              <p className="text-sm text-slate-500">Upload a CSV or Excel file</p>
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
          {/* Template download */}
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <div className="text-sm text-slate-600">
              Need a template? Download with sample data and headers.
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download CSV Template
            </button>
          </div>

          {/* Drop zone */}
          {!results && (
            <div
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer",
                dragOver
                  ? "border-indigo-400 bg-indigo-50"
                  : file
                    ? "border-green-300 bg-green-50"
                    : "border-slate-300 hover:border-slate-400 hover:bg-slate-50",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={handleFileSelect}
              />
              {file ? (
                <>
                  <FileSpreadsheet className="h-10 w-10 text-green-500" />
                  <p className="mt-3 text-sm font-medium text-slate-900">{file.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {(file.size / 1024).toFixed(1)} KB — Click or drop to replace
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-slate-400" />
                  <p className="mt-3 text-sm font-medium text-slate-700">
                    Drop your CSV or Excel file here
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    or click to browse — max 200 rows, 5 MB
                  </p>
                </>
              )}
            </div>
          )}

          {/* Column reference */}
          {!results && (
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-medium text-slate-700 mb-2">Expected Columns</h3>
              <div className="grid grid-cols-3 gap-2">
                {TEMPLATE_COLUMNS.map((col) => (
                  <div key={col} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        ["title", "role_type", "job_description"].includes(col)
                          ? "bg-red-400"
                          : "bg-slate-300",
                      )}
                    />
                    <span className="text-xs text-slate-600 font-mono">{col}</span>
                    {["title", "role_type", "job_description"].includes(col) && (
                      <span className="text-[10px] text-red-500">*</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                * Required fields. role_type: technical, non_technical, mixed. interview_format:
                text, voice, video.
              </p>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 rounded-lg bg-slate-50 px-4 py-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-900">{results.total_rows}</div>
                  <div className="text-xs text-slate-500">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{results.created}</div>
                  <div className="text-xs text-slate-500">Created</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{results.errors}</div>
                  <div className="text-xs text-slate-500">Errors</div>
                </div>
              </div>

              {results.results.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                          Row
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                          Title
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {results.results.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-xs text-slate-600">{r.row}</td>
                          <td className="px-3 py-2 text-xs text-slate-900">
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
          {results ? (
            <>
              <button
                onClick={reset}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Import Another
              </button>
              <button
                onClick={handleClose}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!file || importing}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Import Jobs
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
