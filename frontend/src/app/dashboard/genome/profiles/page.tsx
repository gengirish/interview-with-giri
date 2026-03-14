"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type RoleGenomeProfile } from "@/lib/api";
import { ArrowLeft, Loader2, Plus, Settings } from "lucide-react";
import { toast } from "sonner";

export default function GenomeProfilesPage() {
  const [profiles, setProfiles] = useState<RoleGenomeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listRoleProfiles();
      setProfiles(res.items || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load profiles");
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      await api.createRoleProfile({
        role_type: "technical",
        title: createTitle.trim(),
      });
      setCreateTitle("");
      setShowCreateForm(false);
      await loadProfiles();
      toast.success("Profile created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/genome"
          className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 transition-colors"
          aria-label="Back to genome"
        >
          <ArrowLeft className="h-4 w-4 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Role Genome Profiles</h1>
          <p className="text-sm text-slate-500 mt-1">
            Define ideal competency profiles for each role type
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="ml-auto flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Profile
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h3 className="text-lg font-medium text-slate-900 mb-4">New Role Profile</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="profile-title" className="block text-sm font-medium text-slate-700 mb-1">
                Title
              </label>
              <input
                id="profile-title"
                type="text"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : profiles.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <Settings className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No role profiles yet</h3>
          <p className="mt-1 text-sm text-slate-500">
            Create a profile to define ideal competencies for a role.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <h3 className="font-medium text-slate-900">{p.title}</h3>
              <p className="mt-1 text-xs text-slate-500">{p.role_type}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
