"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  BarChart3,
  Check,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Bar,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { LazyBarChart } from "@/components/lazy-charts";

interface OutcomeItem {
  id: string;
  session_id: string;
  candidate_email: string;
  was_hired: boolean;
  performance_rating: number | null;
  retention_months: number | null;
  is_still_employed: boolean | null;
  created_at: string | null;
}

interface PredictionStatus {
  model: {
    id: string;
    model_version: number;
    training_sample_size: number | null;
    feature_weights: Record<string, number>;
    accuracy_metrics: Record<string, number>;
    is_active: boolean;
    trained_at: string | null;
  } | null;
  trainable_outcomes: number;
  outcomes_needed: number;
}

interface InsightItem {
  factor: string;
  weight: number;
  impact: string;
}

export default function PredictionsPage() {
  const [status, setStatus] = useState<PredictionStatus | null>(null);
  const [outcomes, setOutcomes] = useState<{ items: OutcomeItem[]; total: number }>({
    items: [],
    total: 0,
  });
  const [insights, setInsights] = useState<{ feature_importance: InsightItem[]; message?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, outcomesRes, insightsRes] = await Promise.all([
        api.getPredictionStatus(),
        api.listOutcomes(1, 20),
        api.getInsights(),
      ]);
      setStatus(statusRes);
      setOutcomes(outcomesRes);
      setInsights(insightsRes);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load predictions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRetrain() {
    setTraining(true);
    try {
      await api.trainModel();
      toast.success("Model retrained successfully");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to train model");
    } finally {
      setTraining(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const model = status?.model ?? null;
  const trainable = status?.trainable_outcomes ?? 0;
  const needed = status?.outcomes_needed ?? 10;
  const progress = Math.min(100, (trainable / needed) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Predictive Hiring</h1>
        <p className="mt-1 text-sm text-slate-500">
          ML-powered success prediction from interview signals and hiring outcomes
        </p>
      </div>

      {/* Model health card */}
      <div
        data-testid="model-health-card"
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Target className="h-4 w-4 text-indigo-600" />
          Model Health
        </h2>

        {model ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Training samples</p>
                <p className="text-lg font-semibold text-slate-900">
                  {model.training_sample_size ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Accuracy</p>
                <p className="text-lg font-semibold text-slate-900">
                  {model.accuracy_metrics?.accuracy != null
                    ? `${(model.accuracy_metrics.accuracy * 100).toFixed(0)}%`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Version</p>
                <p className="text-lg font-semibold text-slate-900">
                  v{model.model_version}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Last trained</p>
                <p className="text-sm font-medium text-slate-700">
                  {model.trained_at
                    ? new Date(model.trained_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRetrain}
              disabled={training || trainable < needed}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {training ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Retrain
            </button>
          </div>
        ) : (
          <div data-testid="empty-model-state" className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">
              Record hiring outcomes (was hired + performance rating) to train the prediction model.
            </p>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Record {Math.max(0, needed - trainable)} more outcomes to train</span>
                <span>{trainable} / {needed}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Insights chart */}
      {insights && insights.feature_importance.length > 0 && (
        <div
          data-testid="insights-chart"
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-4">
            <BarChart3 className="h-4 w-4 text-indigo-600" />
            Which Signals Matter Most
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LazyBarChart
                data={insights.feature_importance.map((i) => ({
                  name: i.factor,
                  value: i.weight,
                  impact: i.impact,
                }))}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 80, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={76}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(v) => [Number(v).toFixed(3), "Weight"]}
                  labelFormatter={(l) => l}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {insights.feature_importance.map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        insights.feature_importance[i].impact === "positive"
                          ? "#10b981"
                          : "#ef4444"
                      }
                    />
                  ))}
                </Bar>
              </LazyBarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent outcomes table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <TrendingUp className="h-4 w-4 text-indigo-600" />
            Recent Outcomes
          </h2>
        </div>
        <div className="overflow-x-auto">
          {outcomes.items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No outcomes recorded yet. Record hiring outcomes from interview detail pages.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="px-6 py-3 text-left font-medium text-slate-700">
                    Candidate
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-slate-700">
                    Hired
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-slate-700">
                    Performance
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-slate-700">
                    Retention
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {outcomes.items.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-slate-100 hover:bg-slate-50/50"
                  >
                    <td className="px-6 py-3">
                      <Link
                        href={`/dashboard/interviews/${o.session_id}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {o.candidate_email}
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      {o.was_hired ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          <Check className="h-3 w-3" />
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          <X className="h-3 w-3" />
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {o.performance_rating != null
                        ? o.performance_rating.toFixed(1)
                        : "—"}
                    </td>
                    <td className="px-6 py-3">
                      {o.retention_months != null
                        ? `${o.retention_months} mo`
                        : "—"}
                    </td>
                    <td className="px-6 py-3">
                      <Link
                        href={`/dashboard/interviews/${o.session_id}`}
                        className="text-indigo-600 hover:underline text-xs"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
