"use client";

import { X } from "lucide-react";
import type { TooltipRenderProps } from "react-joyride";

export function CustomTooltip({
  continuous,
  index,
  step,
  size,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  isLastStep,
}: TooltipRenderProps) {
  return (
    <div className="w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
      <div className="relative px-5 pt-5 pb-4">
        <button
          {...closeProps}
          className="absolute top-3 right-3 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          aria-label="Close tour"
        >
          <X className="h-4 w-4" />
        </button>

        {step.title && (
          <h3 className="pr-6 text-base font-semibold text-slate-900">
            {step.title}
          </h3>
        )}

        <div className="mt-2 text-sm leading-relaxed text-slate-600">
          {step.content}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
        <span className="text-xs text-slate-400">
          Step {index + 1} of {size}
        </span>

        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              {...backProps}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Back
            </button>
          )}

          {!isLastStep && (
            <button
              {...skipProps}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
            >
              Skip
            </button>
          )}

          {continuous && (
            <button
              {...primaryProps}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              {isLastStep ? "Done" : "Next"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
