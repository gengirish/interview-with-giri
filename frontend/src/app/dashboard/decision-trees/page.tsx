"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type DecisionTree } from "@/lib/api";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Loader2,
  GitBranch,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

export default function DecisionTreesPage() {
  const [trees, setTrees] = useState<DecisionTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    role_type: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadTrees = async () => {
    try {
      const list = await api.listDecisionTrees();
      setTrees(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load decision trees");
      setTrees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrees();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await api.createDecisionTree({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        role_type: createForm.role_type.trim() || undefined,
      });
      setCreateForm({ name: "", description: "", role_type: "" });
      setShowCreateForm(false);
      await loadTrees();
      toast.success("Decision tree created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tree");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteDecisionTree(id);
      await loadTrees();
      toast.success("Decision tree deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete tree");
    } finally {
      setDeleteId(null);
    }
  }

  async function handleDuplicate(id: string) {
    try {
      await api.duplicateDecisionTree(id);
      await loadTrees();
      toast.success("Decision tree duplicated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate tree");
    }
  }

  function formatDate(date: string | null): string {
    if (!date) return "—";
    return new Date(date).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Decision Trees</h1>
          <p className="text-sm text-slate-500 mt-1">
            Design non-linear interview flows with branching based on candidate performance
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create New
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <h3 className="text-lg font-medium text-slate-900">Create Decision Tree</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="tree-name" className="block text-sm font-medium text-slate-700 mb-1">
                Name
              </label>
              <input
                id="tree-name"
                type="text"
                required
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Technical Interview Flow"
              />
            </div>
            <div>
              <label htmlFor="tree-role" className="block text-sm font-medium text-slate-700 mb-1">
                Role Type
              </label>
              <select
                id="tree-role"
                value={createForm.role_type}
                onChange={(e) => setCreateForm({ ...createForm, role_type: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                <option value="">Any</option>
                <option value="technical">Technical</option>
                <option value="non_technical">Non-Technical</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="tree-desc" className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              id="tree-desc"
              rows={2}
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="Optional description"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {trees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <GitBranch className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No decision trees yet</h3>
          <p className="mt-1 text-sm text-slate-500">
            Create your first decision tree to design non-linear interview flows.
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Create New
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {trees.map((tree) => (
            <div
              key={tree.id}
              className="rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <Link
                    href={`/dashboard/decision-trees/${tree.id}`}
                    className="flex items-center gap-2 group"
                  >
                    <h3 className="text-lg font-semibold text-slate-900 group-hover:text-indigo-600">
                      {tree.name}
                    </h3>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600" />
                  </Link>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {tree.role_type && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                        {tree.role_type}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        tree.is_published ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                      )}
                    >
                      {tree.is_published ? "Published" : "Draft"}
                    </span>
                    <span className="text-xs text-slate-500">
                      Used {tree.usage_count} time{tree.usage_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {tree.description && (
                    <p className="mt-1.5 text-sm text-slate-500 line-clamp-2">{tree.description}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    Created {formatDate(tree.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Link
                    href={`/dashboard/decision-trees/${tree.id}`}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDuplicate(tree.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => setDeleteId(tree.id)}
                    className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
        title="Delete decision tree"
        description="Are you sure you want to delete this decision tree? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
