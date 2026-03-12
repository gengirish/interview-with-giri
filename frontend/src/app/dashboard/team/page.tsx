"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Shield,
  ShieldCheck,
  Eye,
  UserX,
  UserCheck,
} from "lucide-react";
import { api, type OrgUser } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin", icon: ShieldCheck, color: "text-red-600 bg-red-50" },
  { value: "hiring_manager", label: "Hiring Manager", icon: Shield, color: "text-blue-600 bg-blue-50" },
  { value: "viewer", label: "Viewer", icon: Eye, color: "text-slate-600 bg-slate-50" },
];

export default function TeamPage() {
  const { hasRole, isAuthenticated } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    full_name: "",
    role: "viewer",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deactivateUserId, setDeactivateUserId] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && !hasRole("admin")) {
      router.push("/dashboard");
      return;
    }
    if (isAuthenticated) {
      loadUsers();
    }
  }, [isAuthenticated, hasRole, router]);

  async function loadUsers() {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch {
      toast.error("Failed to load team members");
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.inviteUser(inviteForm);
      toast.success("Team member added successfully");
      setShowInvite(false);
      setInviteForm({ email: "", full_name: "", role: "viewer", password: "" });
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite user");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      await api.updateUserRole(userId, newRole);
      toast.success("Role updated");
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function handleToggleActive(userId: string) {
    try {
      await api.toggleUserActive(userId);
      toast.success("User status updated");
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setDeactivateUserId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage team members and their access levels
          </p>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Add Member
        </button>
      </div>

      {showInvite && (
        <form
          onSubmit={handleInvite}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <h3 className="text-lg font-semibold text-slate-900">
            Add Team Member
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="team-full-name" className="block text-sm font-medium text-slate-700 mb-1">
                Full Name
              </label>
              <input
                id="team-full-name"
                type="text"
                required
                minLength={2}
                value={inviteForm.full_name}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, full_name: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label htmlFor="team-email" className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                id="team-email"
                type="email"
                required
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, email: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="jane@company.com"
              />
            </div>
            <div>
              <label htmlFor="team-password" className="block text-sm font-medium text-slate-700 mb-1">
                Temporary Password
              </label>
              <input
                id="team-password"
                type="password"
                required
                minLength={8}
                value={inviteForm.password}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, password: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Min 8 characters"
              />
            </div>
            <div>
              <label htmlFor="team-role" className="block text-sm font-medium text-slate-700 mb-1">
                Role
              </label>
              <select
                id="team-role"
                value={inviteForm.role}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, role: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Adding..." : "Add Member"}
            </button>
            <button
              type="button"
              onClick={() => setShowInvite(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
          <div className="grid grid-cols-12 gap-4 text-xs font-medium text-slate-500 uppercase tracking-wider">
            <div className="col-span-4">Member</div>
            <div className="col-span-3">Role</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-3 text-right">Actions</div>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {users.map((u) => {
            const roleInfo = ROLE_OPTIONS.find((r) => r.value === u.role);
            return (
              <div
                key={u.id}
                className="grid grid-cols-12 gap-4 items-center px-6 py-4"
              >
                <div className="col-span-4">
                  <p className="text-sm font-medium text-slate-900">
                    {u.full_name}
                  </p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
                <div className="col-span-3">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer ${roleInfo?.color || "bg-slate-50 text-slate-600"}`}
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${u.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                  >
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="col-span-3 flex justify-end gap-2">
                  <button
                    onClick={() =>
                      u.is_active ? setDeactivateUserId(u.id) : handleToggleActive(u.id)
                    }
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title={u.is_active ? "Deactivate" : "Activate"}
                    aria-label={u.is_active ? "Deactivate user" : "Activate user"}
                  >
                    {u.is_active ? (
                      <UserX className="h-4 w-4" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
          {users.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No team members yet. Click &quot;Add Member&quot; to get started.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Role Permissions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ROLE_OPTIONS.map((role) => (
            <div key={role.value} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <role.icon className="h-5 w-5 text-indigo-600" />
                <span className="font-medium text-slate-900">{role.label}</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {role.value === "admin" && (
                  <>
                    <li>Full access to all features</li>
                    <li>Manage team members and roles</li>
                    <li>Billing and subscription management</li>
                    <li>Webhook and integration settings</li>
                    <li>Delete job postings</li>
                  </>
                )}
                {role.value === "hiring_manager" && (
                  <>
                    <li>Create and edit job postings</li>
                    <li>Generate interview links</li>
                    <li>View all interviews and reports</li>
                    <li>Generate candidate reports</li>
                    <li>View analytics and dashboard</li>
                  </>
                )}
                {role.value === "viewer" && (
                  <>
                    <li>View dashboard and analytics</li>
                    <li>View job postings (read-only)</li>
                    <li>View interviews and reports</li>
                    <li>No create/edit/delete permissions</li>
                  </>
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={deactivateUserId !== null}
        onConfirm={() => deactivateUserId && handleToggleActive(deactivateUserId)}
        onCancel={() => setDeactivateUserId(null)}
        title="Deactivate team member"
        description={
          deactivateUserId
            ? `Are you sure you want to deactivate ${users.find((u) => u.id === deactivateUserId)?.full_name ?? "this user"}? They will lose access to the organization.`
            : ""
        }
        confirmLabel="Deactivate"
        variant="warning"
      />
    </div>
  );
}
