"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Clip } from "@/lib/api";
import {
  Film,
  Loader2,
  Share2,
  Search,
  ChevronDown,
  ChevronUp,
  Trash2,
  Filter,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

function formatClipType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ClipsPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const loadClips = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listClips({
        type: filterType || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        q: search.trim() || undefined,
      });
      setClips(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load clips");
      setClips([]);
    } finally {
      setLoading(false);
    }
  }, [filterType, dateFrom, dateTo, search]);

  useEffect(() => {
    loadClips();
  }, [loadClips]);

  async function handleShare(clip: Clip) {
    try {
      const { share_url } = await api.shareClip(clip.id);
      await navigator.clipboard.writeText(share_url);
      toast.success("Share link copied to clipboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create share link");
    }
  }

  async function handleDelete(clip: Clip, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this clip?")) return;
    try {
      await api.deleteClip(clip.id);
      toast.success("Clip deleted");
      loadClips();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete clip");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Interview Clip Studio</h1>
        <p className="text-sm text-slate-500 mt-1">
          AI-extracted key moments from interviews. Review in 2 minutes instead of full transcripts.
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          <Filter className="h-4 w-4" />
          Filters
          {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showFilters && (
          <div className="mt-4 flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="filter-type" className="text-xs text-slate-500">Type</label>
              <select
                id="filter-type"
                aria-label="Type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              >
                <option value="">All types</option>
                <option value="best_answer">Best Answer</option>
                <option value="red_flag">Red Flag</option>
                <option value="key_insight">Key Insight</option>
                <option value="culture_signal">Culture Signal</option>
                <option value="technical_deep_dive">Technical Deep Dive</option>
                <option value="growth_indicator">Growth Indicator</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-1 items-center gap-2 min-w-[200px]">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search title, description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm placeholder:text-slate-400"
              />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : clips.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Film className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No clips yet</h3>
          <p className="mt-1 text-sm text-slate-500">
            Generate clips from completed interviews on the interview detail page.
          </p>
          <Link
            href="/dashboard/interviews"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Go to Interviews
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clips.map((clip) => (
            <div
              key={clip.id}
              className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden hover:border-indigo-200 transition-colors"
            >
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === clip.id ? null : clip.id)}
                className="w-full text-left p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      getClipTypeColor(clip.clip_type),
                    )}
                  >
                    {formatClipType(clip.clip_type)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShare(clip);
                      }}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Share"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(clip, e)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-slate-900 line-clamp-2">{clip.title}</h3>
                <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                  {clip.transcript_excerpt.slice(0, 120)}
                  {clip.transcript_excerpt.length > 120 ? "…" : ""}
                </p>
                {clip.importance_score != null && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${clip.importance_score * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">
                      {(clip.importance_score * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <Link
                    href={`/dashboard/interviews/${clip.session_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    View interview
                  </Link>
                  {expandedId === clip.id ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </div>
              </button>
              {expandedId === clip.id && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                  <p className="text-xs font-medium text-slate-500 mb-1">Full transcript excerpt</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{clip.transcript_excerpt}</p>
                  {clip.description && (
                    <p className="mt-2 text-xs text-slate-600 italic">{clip.description}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
