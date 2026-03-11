"use client";

import { useEffect, useState } from "react";
import { api, type SubscriptionInfo } from "@/lib/api";
import {
  Loader2,
  CreditCard,
  Users,
  Building,
  Bell,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("billing");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaved, setWebhookSaved] = useState(false);

  useEffect(() => {
    api
      .getSubscription()
      .then(setSub)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade(planId: string) {
    try {
      const res = await api.createCheckout(planId);
      if (res.url) window.location.href = res.url;
    } catch {
      // error
    }
  }

  async function handleSaveWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!webhookUrl) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001"}/api/v1/webhooks/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            url: webhookUrl,
            events: ["interview.completed", "interview.scored"],
          }),
        },
      );
      setWebhookSaved(true);
      setTimeout(() => setWebhookSaved(false), 3000);
    } catch {
      // error
    }
  }

  const tabs = [
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "webhooks", label: "Webhooks", icon: Link2 },
    { id: "notifications", label: "Notifications", icon: Bell },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your organization settings
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "billing" && sub && (
        <div className="space-y-6">
          {/* Current Plan */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              Current Plan
            </h3>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <span className="text-2xl font-bold text-slate-900 capitalize">
                  {sub.plan_tier}
                </span>
                <p className="text-sm text-slate-500 mt-1">
                  {sub.interviews_used} / {sub.interviews_limit} interviews used
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  sub.status === "active"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700",
                )}
              >
                {sub.status}
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{
                  width: `${Math.min((sub.interviews_used / sub.interviews_limit) * 100, 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Allowed formats: {sub.allowed_formats.join(", ")}
            </p>
          </div>

          {/* Upgrade Plans */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[
              {
                id: "starter",
                name: "Starter",
                price: "$99",
                features: [
                  "50 interviews/month",
                  "Text interviews",
                  "2 team members",
                  "Basic analytics",
                ],
              },
              {
                id: "professional",
                name: "Professional",
                price: "$299",
                popular: true,
                features: [
                  "200 interviews/month",
                  "Text + Voice interviews",
                  "10 team members",
                  "Full analytics",
                  "API access",
                ],
              },
              {
                id: "enterprise",
                name: "Enterprise",
                price: "$799",
                features: [
                  "Unlimited interviews",
                  "All formats (Text, Voice, Video)",
                  "Unlimited team members",
                  "Custom branding",
                  "Priority support",
                  "SSO",
                ],
              },
            ].map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "rounded-xl border p-6",
                  plan.popular
                    ? "border-indigo-300 bg-indigo-50/30 shadow-md"
                    : "border-slate-200 bg-white shadow-sm",
                )}
              >
                {plan.popular && (
                  <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-medium text-white">
                    Most Popular
                  </span>
                )}
                <h4 className="mt-2 text-lg font-bold text-slate-900">
                  {plan.name}
                </h4>
                <div className="mt-1">
                  <span className="text-3xl font-bold text-slate-900">
                    {plan.price}
                  </span>
                  <span className="text-sm text-slate-500">/month</span>
                </div>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-slate-600"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={sub.plan_tier === plan.id}
                  className={cn(
                    "mt-6 w-full rounded-lg py-2.5 text-sm font-medium transition-colors",
                    sub.plan_tier === plan.id
                      ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                      : plan.popular
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "border border-indigo-600 text-indigo-600 hover:bg-indigo-50",
                  )}
                >
                  {sub.plan_tier === plan.id ? "Current Plan" : "Upgrade"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "webhooks" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Webhook Configuration
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Get notified when interview events occur.
          </p>
          <form onSubmit={handleSaveWebhook} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Webhook URL
              </label>
              <input
                type="url"
                required
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-app.com/webhooks/interviews"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              <p className="font-medium text-slate-700 mb-1">Events:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  <code>interview.completed</code> - When a candidate finishes
                  the interview
                </li>
                <li>
                  <code>interview.scored</code> - When the AI scoring report is
                  generated
                </li>
              </ul>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              {webhookSaved ? "Saved!" : "Save Webhook"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Email Notifications
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Configure when you receive email alerts.
          </p>
          <div className="mt-4 space-y-4">
            {[
              {
                label: "Interview completed",
                desc: "Get notified when a candidate finishes an interview",
              },
              {
                label: "Report generated",
                desc: "Get notified when AI scoring is complete",
              },
              {
                label: "Weekly digest",
                desc: "Receive a weekly summary of all interviews",
              },
            ].map((item) => (
              <label
                key={item.label}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-4 hover:bg-slate-50 cursor-pointer"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {item.label}
                  </p>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
