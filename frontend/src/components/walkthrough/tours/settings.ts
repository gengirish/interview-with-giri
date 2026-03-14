import type { TourDefinition } from "./index";

export const settingsTour: TourDefinition = {
  id: "settings-page",
  route: "/dashboard/settings",
  roles: ["admin"],
  steps: [
    {
      target: '[data-tour="settings-billing"]',
      title: "Billing & Subscription",
      content:
        "Manage your subscription plan, view usage, and upgrade or downgrade as needed.",
      placement: "bottom",
      disableBeacon: true,
    },
    {
      target: '[data-tour="settings-branding"]',
      title: "Branding",
      content:
        "Customize the logo, colors, and company name that candidates see during their interview experience.",
      placement: "bottom",
    },
    {
      target: '[data-tour="settings-webhooks"]',
      title: "Webhooks",
      content:
        "Send interview events to external systems like Slack, your ATS, or custom endpoints.",
      placement: "top",
    },
    {
      target: '[data-tour="settings-ats"]',
      title: "ATS Integration",
      content:
        "Connect your Applicant Tracking System (Greenhouse, Lever, Workable) to sync candidate data automatically.",
      placement: "top",
    },
  ],
};
