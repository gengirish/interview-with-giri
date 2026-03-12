"use client";

import { useEffect } from "react";

type ConfirmDialogProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "danger" | "warning";
};

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "danger",
}: ConfirmDialogProps) {
  const titleId = "confirm-dialog-title";
  const descId = "confirm-dialog-desc";

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClass =
    variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-amber-600 text-white hover:bg-amber-700";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        className="absolute inset-0 bg-slate-900/50"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-sm text-slate-500">
          {description}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
