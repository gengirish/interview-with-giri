"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle, RotateCcw, Play } from "lucide-react";
import { usePathname } from "next/navigation";

import { useWalkthrough } from "@/hooks/use-walkthrough";
import { getTourForRoute } from "./tours";

export function HelpButton() {
  const pathname = usePathname();
  const { startTour, resetAll, currentTourId } = useWalkthrough();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const role =
    typeof window !== "undefined" ? localStorage.getItem("role") : null;
  const tour = pathname ? getTourForRoute(pathname, role) : null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  if (currentTourId) return null;
  if (pathname?.startsWith("/interview/")) return null;

  return (
    <div ref={menuRef} className="fixed bottom-6 right-6 z-50" data-testid="help-button">
      {open && (
        <div className="absolute bottom-14 right-0 w-56 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden mb-2">
          {tour && (
            <button
              onClick={() => {
                startTour(tour.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Play className="h-4 w-4 text-indigo-600" />
              Replay page tour
            </button>
          )}
          {!tour && (
            <div className="px-4 py-3 text-sm text-slate-400">
              No tour available for this page
            </div>
          )}
          <div className="border-t border-slate-100">
            <button
              onClick={() => {
                resetAll();
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Reset all tours
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        aria-label="Help and tours"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
    </div>
  );
}
