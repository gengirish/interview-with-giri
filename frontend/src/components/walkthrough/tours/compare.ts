import type { TourDefinition } from "./index";

export const compareTour: TourDefinition = {
  id: "compare-page",
  route: "/dashboard/compare",
  steps: [
    {
      target: '[data-tour="compare-job-select"]',
      title: "Select a Job",
      content:
        "Choose a job posting to compare all candidates who interviewed for that role side by side.",
      placement: "bottom",
      disableBeacon: true,
    },
    {
      target: '[data-tour="compare-table"]',
      title: "Candidate Comparison",
      content:
        "See scores side by side across all dimensions. Quickly identify which candidates performed best in each area.",
      placement: "bottom",
    },
    {
      target: '[data-tour="compare-shortlist"]',
      title: "Shortlist Candidates",
      content:
        "Toggle the star to add candidates to your shortlist. Shortlisted candidates are highlighted for easy tracking.",
      placement: "left",
    },
    {
      target: '[data-tour="compare-debrief"]',
      title: "AI Debrief",
      content:
        "Get an AI-generated summary comparing all candidates, highlighting trade-offs and recommending the best fit.",
      placement: "top",
    },
  ],
};
