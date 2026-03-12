"use client";

import { useEffect, useState } from "react";
import { api, type SubscriptionInfo } from "@/lib/api";
import {
  Loader2,
  CreditCard,
  Bell,
  Link2,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function SettingsPage() {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("billing");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [atsConfigs, setAtsConfigs] = useState<
    { platform: string; enabled: boolean }[]
  >([]);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsConnecting, setAtsConnecting] = useState<string | null>(null);
  const [atsForm, setAtsForm] = useState<{
    platform: string;
    apiKey: string;
    subdomain: string;
  }>({ platform: "", apiKey: "", subdomain: "" });
  const [notificationPrefs, setNotificationPrefs] = useState<{
    interview_completed: boolean;
    report_generated: boolean;
    weekly_digest: boolean;
  }>({
    interview_completed: true,
    report_generated: true,
    weekly_digest: true,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("notification_preferences");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{
          interview_completed: boolean;
          report_generated: boolean;
          weekly_digest: boolean;
        }>;
        setNotificationPrefs((p) => ({ ...p, ...parsed }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    api
      .getSubscription()
      .then(setSub)
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Failed to load subscription");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "integrations") {
      setAtsLoading(true);
      api
        .getATSConfigs()
        .then(setAtsConfigs)
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Failed to load ATS configs");
        })
        .finally(() => setAtsLoading(false));
    }
  }, [activeTab]);

  async function handleUpgrade(planId: string) {
    try {
      const res = await api.createCheckout(planId);
      if (res.url) window.location.href = res.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout");
    }
  }

  async function handleSaveWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!webhookUrl) return;
    try {
      await api.addWebhookConfig({
        url: webhookUrl,
        events: ["interview.completed", "interview.scored"],
        secret: "",
      });
      setWebhookSaved(true);
      setTimeout(() => setWebhookSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save webhook");
    }
  }

  async function handleSaveATSConfig(platform: string) {
    if (!atsForm.apiKey.trim()) {
      toast.error("API key is required");
      return;
    }
    if (platform === "workable" && !atsForm.subdomain.trim()) {
      toast.error("Subdomain is required for Workable");
      return;
    }
    try {
      await api.saveATSConfig({
        platform,
        api_key: atsForm.apiKey,
        enabled: true,
        ...(platform === "workable" && atsForm.subdomain
          ? { subdomain: atsForm.subdomain }
          : {}),
      });
      const configs = await api.getATSConfigs();
      setAtsConfigs(configs);
      setAtsConnecting(null);
      setAtsForm({ platform: "", apiKey: "", subdomain: "" });
      toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} connected successfully`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save ATS config");
    }
  }

  async function handleDisconnectATS(platform: string) {
    try {
      await api.deleteATSConfig(platform);
      setAtsConfigs((prev) => prev.filter((c) => c.platform !== platform));
      toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} disconnected`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    }
  }

  const tabs = [
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "webhooks", label: "Webhooks", icon: Link2 },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "integrations", label: "Integrations", icon: Plug },
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
              <label htmlFor="webhook-url" className="block text-sm font-medium text-slate-700 mb-1">
                Webhook URL
              </label>
              <input
                id="webhook-url"
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
                key: "interview_completed" as const,
                label: "Interview completed",
                desc: "Get notified when a candidate finishes an interview",
              },
              {
                key: "report_generated" as const,
                label: "Report generated",
                desc: "Get notified when AI scoring is complete",
              },
              {
                key: "weekly_digest" as const,
                label: "Weekly digest",
                desc: "Receive a weekly summary of all interviews",
              },
            ].map((item) => (
              <label
                key={item.key}
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
                  checked={notificationPrefs[item.key]}
                  onChange={() => {
                    const next = {
                      ...notificationPrefs,
                      [item.key]: !notificationPrefs[item.key],
                    };
                    setNotificationPrefs(next);
                    try {
                      localStorage.setItem(
                        "notification_preferences",
                        JSON.stringify(next)
                      );
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {activeTab === "integrations" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              ATS Integrations
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Connect your Applicant Tracking System to push scorecards automatically.
            </p>
            {atsLoading ? (
              <div className="mt-6 flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                {[
                  {
                    platform: "greenhouse",
                    name: "Greenhouse",
                    color: "#23a55d",
                  },
                  {
                    platform: "lever",
                    name: "Lever",
                    color: "#5c6bc0",
                  },
                  {
                    platform: "workable",
                    name: "Workable",
                    color: "#1da1f2",
                  },
                ].map(({ platform, name, color }) => {
                  const isConnected = atsConfigs.some(
                    (c) => c.platform === platform
                  );
                  const isExpanded = atsConnecting === platform;
                  return (
                    <div
                      key={platform}
                      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold text-sm"
                          style={{ backgroundColor: color }}
                        >
                          {name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {name}
                          </p>
                          <span
                            className={cn(
                              "inline-block mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
                              isConnected
                                ? "bg-green-50 text-green-700"
                                : "bg-slate-100 text-slate-600",
                            )}
                          >
                            {isConnected ? "Connected" : "Not Connected"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        {!isConnected ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAtsConnecting(platform);
                              setAtsForm({
                                platform,
                                apiKey: "",
                                subdomain: "",
                              });
                            }}
                            className="rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors"
                            style={{ backgroundColor: color }}
                          >
                            Connect
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDisconnectATS(platform)}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            Disconnect
                          </button>
                        )}
                      </div>
                      {isExpanded && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSaveATSConfig(platform);
                          }}
                          className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
                        >
                          <div>
                            <label
                              htmlFor={`ats-api-key-${platform}`}
                              className="block text-sm font-medium text-slate-700 mb-1"
                            >
                              API Key
                            </label>
                            <input
                              id={`ats-api-key-${platform}`}
                              type="password"
                              required
                              value={
                                atsForm.platform === platform
                                  ? atsForm.apiKey
                                  : ""
                              }
                              onChange={(e) =>
                                setAtsForm((prev) =>
                                  prev.platform === platform
                                    ? { ...prev, apiKey: e.target.value }
                                    : prev,
                                )
                              }
                              placeholder="Enter your API key"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                            />
                          </div>
                          {platform === "workable" && (
                            <div>
                              <label
                                htmlFor={`ats-subdomain-${platform}`}
                                className="block text-sm font-medium text-slate-700 mb-1"
                              >
                                Subdomain
                              </label>
                              <input
                                id={`ats-subdomain-${platform}`}
                                type="text"
                                required
                                value={
                                  atsForm.platform === platform
                                    ? atsForm.subdomain
                                    : ""
                                }
                                onChange={(e) =>
                                  setAtsForm((prev) =>
                                    prev.platform === platform
                                      ? { ...prev, subdomain: e.target.value }
                                      : prev,
                                  )
                                }
                                placeholder="yourcompany"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAtsConnecting(null);
                                setAtsForm({
                                  platform: "",
                                  apiKey: "",
                                  subdomain: "",
                                });
                              }}
                              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
