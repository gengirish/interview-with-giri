"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    org_name: "",
    full_name: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.signup(formData);
      localStorage.setItem("token", res.access_token);
      localStorage.setItem("role", res.role);
      localStorage.setItem("org_id", res.org_id);
      toast.success("Account created! Welcome to Interview Bot.");
      router.push("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Signup failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50/30 px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900">Get Started</h1>
          <p className="mt-2 text-slate-500">Create your Interview Bot account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div>
            <label htmlFor="signup-org-name" className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
            <input
              id="signup-org-name"
              name="org_name"
              required
              value={formData.org_name}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <label htmlFor="signup-full-name" className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <input
              id="signup-full-name"
              name="full_name"
              required
              value={formData.full_name}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="Jane Doe"
            />
          </div>

          <div>
            <label htmlFor="signup-email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              id="signup-email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="jane@acme.com"
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              id="signup-password"
              name="password"
              type="password"
              required
              minLength={8}
              value={formData.password}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="Min 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-6 py-2.5 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>

          <p className="text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="text-indigo-600 hover:text-indigo-500 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
