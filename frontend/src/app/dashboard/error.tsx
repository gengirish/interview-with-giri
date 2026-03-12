"use client";

import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[50vh] px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
