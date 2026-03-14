import type { TourDefinition } from "./index";

export const reportsTour: TourDefinition = {
  id: "reports-page",
  route: "/dashboard/reports",
  steps: [
    {
      target: '[data-tour="reports-list"]',
      title: "Interview Reports",
      content:
        "View all completed interview reports. Each report contains AI-generated scores, evidence, and hiring recommendations.",
      placement: "bottom",
      disableBeacon: true,
    },
    {
      target: '[data-tour="report-recommendation"]',
      title: "AI Recommendation",
      content:
        "Each report includes an AI recommendation — Strong Hire, Hire, or No Hire — along with a confidence score.",
      placement: "bottom",
    },
    {
      target: '[data-tour="report-view"]',
      title: "Detailed Report",
      content:
        "Click to see the full scoring breakdown with dimensional scores, evidence, strengths, and areas of concern.",
      placement: "left",
    },
  ],
};
