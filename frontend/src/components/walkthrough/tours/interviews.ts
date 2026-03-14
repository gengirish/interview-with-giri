import type { TourDefinition } from "./index";

export const interviewsTour: TourDefinition = {
  id: "interviews-page",
  route: "/dashboard/interviews",
  steps: [
    {
      target: '[data-tour="interviews-table"]',
      title: "Interview Sessions",
      content:
        "Every candidate interview session shows up here. You can see the candidate name, job title, and when the interview took place.",
      placement: "bottom",
      disableBeacon: true,
    },
    {
      target: '[data-tour="interview-status"]',
      title: "Status Tracking",
      content:
        "Track whether interviews are pending, in progress, or completed. Color-coded badges make it easy to scan.",
      placement: "bottom",
    },
    {
      target: '[data-tour="interview-score"]',
      title: "AI Scores",
      content:
        "After an interview is completed, the AI generates an overall score. Click any row to see the full report.",
      placement: "left",
    },
    {
      target: '[data-tour="interview-actions"]',
      title: "View Details",
      content:
        "Click on a session to see the full transcript, AI-scored dimensions, team comments, and export options.",
      placement: "left",
    },
  ],
};
