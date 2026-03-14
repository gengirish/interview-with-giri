import type { TourDefinition } from "./index";

export const analyticsTour: TourDefinition = {
  id: "analytics-page",
  route: "/dashboard/analytics",
  steps: [
    {
      target: '[data-tour="analytics-kpis"]',
      title: "Key Metrics",
      content:
        "High-level hiring metrics: total interviews, completion rate, average score, and average duration across your organization.",
      placement: "bottom",
      disableBeacon: true,
    },
    {
      target: '[data-tour="analytics-score-dist"]',
      title: "Score Distribution",
      content:
        "See how candidates score across the board. The chart shows the distribution of overall scores to spot trends.",
      placement: "top",
    },
    {
      target: '[data-tour="analytics-per-job"]',
      title: "Per-Job Breakdown",
      content:
        "Drill into performance by job posting. Compare completion rates, average scores, and interview volumes per role.",
      placement: "top",
    },
    {
      target: '[data-tour="analytics-satisfaction"]',
      title: "Candidate Satisfaction",
      content:
        "Track candidate feedback and satisfaction trends. See how candidates rate the fairness, clarity, and relevance of interviews.",
      placement: "top",
    },
  ],
};
