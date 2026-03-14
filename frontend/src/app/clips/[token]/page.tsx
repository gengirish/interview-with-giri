"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, type Clip } from "@/lib/api";
import { Film, Loader2 } from "lucide-react";

function formatClipType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const CLIP_TYPE_COLORS: Record<string, string> = {
  best_answer: "bg-emerald-100 text-emerald-800",
  red_flag: "bg-red-100 text-red-800",
  key_insight: "bg-indigo-100 text-indigo-800",
  culture_signal: "bg-violet-100 text-violet-800",
  technical_deep_dive: "bg-blue-100 text-blue-800",
  growth_indicator: "bg-teal-100 text-teal-800",
};

function getClipTypeColor(type: string): string {
  return CLIP_TYPE_COLORS[type] ?? "bg-slate-100 text-slate-800";
}

export default function PublicClipPage() {
  const { token } = useParams<{ token: string }>();
  const [clip, setClip] = useState<Clip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"not_found" | "expired" | null>(null);

  useEffect(() => {
    if (!token) return;
    async function load() {
      try {
        const c = await api.getPublicClip(token);
        setClip(c);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 410) setError("expired");
          else setError("not_found");
        } else {
          setError("not_found");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error === "expired") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Film className="mx-auto h-12 w-12 text-slate-300" />
          <h1 className="mt-4 text-lg font-semibold text-slate-900">
            This shared link has expired
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            The clip share link is no longer valid. Please request a new link from
            the interviewer.
          </p>
        </div>
      </div>
    );
  }

  if (error === "not_found" || !clip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Film className="mx-auto h-12 w-12 text-slate-300" />
          <h1 className="mt-4 text-lg font-semibold text-slate-900">
            Clip not found
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            This clip may have been removed or the link is invalid.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-2xl px-4">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-4">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getClipTypeColor(clip.clip_type)}`}
            >
              {formatClipType(clip.clip_type)}
            </span>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">
              {clip.title}
            </h1>
            {clip.description && (
              <p className="mt-1 text-sm text-slate-600">{clip.description}</p>
            )}
          </div>
          <div className="p-6">
            <h2 className="text-sm font-medium text-slate-500 mb-2">
              Transcript excerpt
            </h2>
            <p className="text-slate-700 whitespace-pre-wrap">
              {clip.transcript_excerpt}
            </p>
            {clip.importance_score != null && (
              <div className="mt-4 flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${clip.importance_score * 100}%` }}
                  />
                </div>
                <span className="text-sm text-slate-500">
                  {(clip.importance_score * 100).toFixed(0)}% importance
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
