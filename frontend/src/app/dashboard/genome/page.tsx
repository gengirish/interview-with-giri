"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type CompetencyGenome } from "@/lib/api";
import {
  Dna,
  GitCompare,
  Loader2,
  Search,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import { LazyRadarChart } from "@/components/lazy-charts";

const DIMENSION_LABELS: Record<string, string> = {
  problem_solving: "Problem Solving",
  system_design: "System Design",
  data_structures: "Data Structures",
  algorithms: "Algorithms",
  code_quality: "Code Quality",
  debugging: "Debugging",
  architecture: "Architecture",
  database_design: "DB Design",
  api_design: "API Design",
  security_awareness: "Security",
  communication: "Communication",
  leadership: "Leadership",
  teamwork: "Teamwork",
  adaptability: "Adaptability",
  conflict_resolution: "Conflict Resolution",
  time_management: "Time Mgmt",
  initiative: "Initiative",
  business_acumen: "Business Acumen",
  customer_focus: "Customer Focus",
  innovation: "Innovation",
  decision_making: "Decision Making",
  analytical_thinking: "Analytical",
  cultural_alignment: "Cultural Fit",
  growth_mindset: "Growth Mindset",
};

function formatDimension(key: string): string {
  return DIMENSION_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getTopCompetencies(genome: CompetencyGenome, n = 5): Array<{ key: string; score: number }> {
  const dims = genome.genome_data?.dimensions ?? {};
  return Object.entries(dims)
    .map(([k, v]) => ({
      key: k,
      score: typeof v === "object" && v && "score" in v ? (v as { score: number }).score : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function genomeToRadarData(genome: CompetencyGenome): Array<{ dimension: string; score: number; fullMark: number }> {
  const dims = genome.genome_data?.dimensions ?? {};
  return Object.entries(dims).map(([k, v]) => ({
    dimension: formatDimension(k),
    score: typeof v === "object" && v && "score" in v ? (v as { score: number }).score : 0,
    fullMark: 10,
  }));
}

export default function GenomePage() {
  const [genomes, setGenomes] = useState<CompetencyGenome[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [compareData, setCompareData] = useState<
    Array<{ email: string; name: string | null; genome_data: Record<string, unknown> }> | null
  >(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const loadGenomes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listGenomes(search || undefined);
      setGenomes(res.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load genomes");
      setGenomes([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadGenomes();
  }, [loadGenomes]);

  function toggleSelect(email: string) {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else if (next.size < 5) {
        next.add(email);
      }
      return next;
    });
  }

  async function runCompare() {
    if (selectedEmails.size < 2) {
      toast.error("Select 2–5 candidates to compare");
      return;
    }
    setCompareLoading(true);
    try {
      const res = await api.compareGenomes(Array.from(selectedEmails));
      setCompareData(res.candidates);
      setCompareMode(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to compare");
    } finally {
      setCompareLoading(false);
    }
  }

  function closeCompare() {
    setCompareMode(false);
    setCompareData(null);
    setSelectedEmails(new Set());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Competency Genome</h1>
          <p className="mt-1 text-sm text-slate-500">
            Visual DNA fingerprints for candidates across 24 competency dimensions
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/genome/profiles"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Role Profiles
          </Link>
          {compareMode ? (
            <button
              type="button"
              onClick={closeCompare}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Close Compare
            </button>
          ) : selectedEmails.size >= 2 ? (
            <button
              type="button"
              onClick={runCompare}
              disabled={compareLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {compareLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GitCompare className="h-4 w-4" />
              )}
              Compare ({selectedEmails.size})
            </button>
          ) : null}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-4 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Compare view */}
      {compareMode && compareData && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Side-by-Side Comparison</h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {compareData.map((c) => {
              const dims = (c.genome_data?.dimensions ?? {}) as Record<
                string,
                { score?: number; confidence?: number }
              >;
              const radarData = Object.entries(dims).map(([k, v]) => ({
                dimension: formatDimension(k),
                score: v?.score ?? 0,
                fullMark: 10,
              }));
              return (
                <div
                  key={c.email}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <p className="font-medium text-slate-900">
                    {c.name || c.email}
                  </p>
                  <p className="text-xs text-slate-500">{c.email}</p>
                  {radarData.length > 0 ? (
                    <div className="mt-3 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LazyRadarChart data={radarData}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 10]} />
                          <Radar
                            name="Score"
                            dataKey="score"
                            stroke="#6366f1"
                            fill="#6366f1"
                            fillOpacity={0.3}
                            strokeWidth={2}
                          />
                        </LazyRadarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">No dimension data</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Genome grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : genomes.length === 0 ? (
          <div className="col-span-full rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Dna className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-medium text-slate-900">No genomes yet</h3>
            <p className="mt-1 text-sm text-slate-500">
              Complete interviews and generate reports to build candidate competency genomes.
            </p>
            <Link
              href="/dashboard/interviews"
              className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              View interviews →
            </Link>
          </div>
        ) : (
          genomes.map((g) => {
            const isExpanded = expandedEmail === g.candidate_email;
            const isSelected = selectedEmails.has(g.candidate_email);
            const top = getTopCompetencies(g);
            const radarData = genomeToRadarData(g);

            return (
              <div
                key={g.id}
                className={cn(
                  "rounded-xl border bg-white shadow-sm transition-colors",
                  isSelected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200",
                )}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 truncate">
                        {g.candidate_name || g.candidate_email}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{g.candidate_email}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {g.genome_data?.interview_count ?? 0} interviews
                      </span>
                      {!compareMode && (
                        <button
                          type="button"
                          onClick={() => toggleSelect(g.candidate_email)}
                          className={cn(
                            "rounded p-1.5 transition-colors",
                            isSelected
                              ? "bg-indigo-100 text-indigo-600"
                              : "hover:bg-slate-100 text-slate-400",
                          )}
                          title={isSelected ? "Remove from compare" : "Add to compare"}
                        >
                          <GitCompare className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Top competencies */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {top.map(({ key, score }) => (
                      <span
                        key={key}
                        className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                      >
                        {formatDimension(key)}: {score.toFixed(1)}
                      </span>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedEmail(isExpanded ? null : g.candidate_email)
                    }
                    className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        Hide chart
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        Show radar chart
                      </>
                    )}
                  </button>
                </div>

                {isExpanded && radarData.length > 0 && (
                  <div className="border-t border-slate-200 p-4">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LazyRadarChart data={radarData}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 10]} />
                          <Radar
                            name="Score"
                            dataKey="score"
                            stroke="#6366f1"
                            fill="#6366f1"
                            fillOpacity={0.3}
                            strokeWidth={2}
                          />
                        </LazyRadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
