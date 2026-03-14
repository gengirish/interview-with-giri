"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type KnowledgeEntry } from "@/lib/api";
import {
  BookOpen,
  Loader2,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "question_insight",
  "role_pattern",
  "skill_benchmark",
  "process_recommendation",
  "general",
];

function formatCategory(cat: string): string {
  return cat
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function KnowledgePage() {
  const [query, setQuery] = useState("");
  const [queryLoading, setQueryLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<{
    answer: string;
    sources: Array<{ id: string; title: string; category: string }>;
    query_id: string | null;
  } | null>(null);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [suggestions, setSuggestions] = useState<
    Array<{ title: string; detail: string; type: string }>
  >([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [popularQueries, setPopularQueries] = useState<
    Array<{ query: string; count: number }>
  >([]);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [ratingLoading, setRatingLoading] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    try {
      const res = await api.listKnowledgeEntries(
        categoryFilter || undefined
      );
      setEntries(res.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load entries");
      setEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  }, [categoryFilter]);

  const loadPopularQueries = useCallback(async () => {
    try {
      const res = await api.getPopularQueries();
      setPopularQueries(res.queries || []);
    } catch {
      setPopularQueries([]);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    loadPopularQueries();
  }, [loadPopularQueries]);

  async function handleSubmitQuery(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || queryLoading) return;
    setQueryLoading(true);
    setLastResponse(null);
    try {
      const res = await api.queryKnowledge(q);
      setLastResponse(res);
      loadPopularQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Query failed");
    } finally {
      setQueryLoading(false);
    }
  }

  async function handleGenerateInsights() {
    setSuggestionsLoading(true);
    try {
      const res = await api.getKnowledgeSuggestions();
      setSuggestions(res.suggestions || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate insights");
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function handleGenerateKnowledge() {
    setGenerateLoading(true);
    try {
      const res = await api.generateKnowledge();
      toast.success(`Created ${res.entries_created} knowledge entries`);
      loadEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate knowledge");
    } finally {
      setGenerateLoading(false);
    }
  }

  async function handleRate(queryId: string, rating: number) {
    setRatingLoading(queryId);
    try {
      await api.rateQuery(queryId, rating);
      setLastResponse((prev) =>
        prev ? { ...prev, query_id: prev.query_id } : null
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rate");
    } finally {
      setRatingLoading(null);
    }
  }

  function getTypeBadgeClass(type: string): string {
    switch (type) {
      case "warning":
        return "bg-amber-100 text-amber-800";
      case "success":
        return "bg-emerald-100 text-emerald-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Hiring Knowledge Base
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ask anything about your hiring data — questions, pass rates, insights
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerateKnowledge}
          disabled={generateLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {generateLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Mine Knowledge
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Query section */}
          <form onSubmit={handleSubmitQuery} className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Ask anything about your hiring data..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-4 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={queryLoading || !query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {queryLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Ask"
                )}
              </button>
            </div>
          </form>

          {lastResponse && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                {lastResponse.answer}
              </div>
              {lastResponse.sources.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {lastResponse.sources.map((s) => (
                    <span
                      key={s.id}
                      className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    >
                      {s.title}
                    </span>
                  ))}
                </div>
              )}
              {lastResponse.query_id && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleRate(lastResponse.query_id!, 5)}
                    disabled={ratingLoading === lastResponse.query_id}
                    className="inline-flex items-center gap-1 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-600 transition-colors disabled:opacity-50"
                    title="Helpful"
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRate(lastResponse.query_id!, 1)}
                    disabled={ratingLoading === lastResponse.query_id}
                    className="inline-flex items-center gap-1 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600 transition-colors disabled:opacity-50"
                    title="Not helpful"
                  >
                    <ThumbsDown className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Suggested insights */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Suggested Insights
              </h3>
              <button
                type="button"
                onClick={handleGenerateInsights}
                disabled={suggestionsLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                {suggestionsLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Generate Insights
              </button>
            </div>
            {suggestions.length === 0 ? (
              <p className="text-sm text-slate-500">
                Click &quot;Generate Insights&quot; to get proactive hiring insights.
              </p>
            ) : (
              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-slate-100 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "shrink-0 rounded px-2 py-0.5 text-xs font-medium capitalize",
                          getTypeBadgeClass(s.type)
                        )}
                      >
                        {s.type}
                      </span>
                      <div>
                        <p className="font-medium text-slate-900">{s.title}</p>
                        <p className="mt-0.5 text-sm text-slate-600">
                          {s.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Knowledge browser */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Knowledge Browser
            </h3>
            <div className="mb-3">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {formatCategory(c)}
                  </option>
                ))}
              </select>
            </div>
            {entriesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : entries.length === 0 ? (
              <div className="py-8 text-center">
                <BookOpen className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">
                  No knowledge entries yet. Run &quot;Mine Knowledge&quot; to extract
                  insights from completed interviews.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {entries.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {formatCategory(e.category)}
                    </span>
                    <h4 className="mt-2 font-medium text-slate-900">
                      {e.title}
                    </h4>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {e.content}
                    </p>
                    {e.confidence != null && (
                      <div className="mt-2">
                        <div className="h-1.5 w-full rounded-full bg-slate-200">
                          <div
                            className="h-1.5 rounded-full bg-indigo-500"
                            style={{
                              width: `${(e.confidence ?? 0) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">
                          {((e.confidence ?? 0) * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                    )}
                    {e.tags && e.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {e.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Popular queries sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Popular Queries
            </h3>
            {popularQueries.length === 0 ? (
              <p className="text-sm text-slate-500">
                Ask a question to see popular queries here.
              </p>
            ) : (
              <div className="space-y-2">
                {popularQueries.map((q) => (
                  <button
                    key={q.query}
                    type="button"
                    onClick={() => {
                      setQuery(q.query);
                    }}
                    className="block w-full rounded-lg border border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {q.query}
                    <span className="ml-2 text-xs text-slate-400">
                      ({q.count})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
