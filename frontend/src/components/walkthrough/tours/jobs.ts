import type { TourDefinition } from "./index";

export const jobsTour: TourDefinition = {
  id: "jobs-page",
  route: "/dashboard/jobs",
  steps: [
    {
      target: '[data-tour="jobs-list"]',
      title: "Your Job Postings",
      content:
        "All your job postings appear here. Each card shows the role title, interview format, and status.",
      placement: "bottom",
      disableBeacon: true,
    },
    {
      target: '[data-tour="create-job"]',
      title: "Create a New Job",
      content:
        "Click here to create a new job posting. You'll define the role, description, required skills, and interview format.",
      placement: "bottom",
    },
    {
      target: '[data-tour="job-format"]',
      title: "Interview Format",
      content:
        "Each job can use a different format — text chat, voice, video, or coding. Choose the one that best fits the role.",
      placement: "bottom",
    },
    {
      target: '[data-tour="generate-link"]',
      title: "Generate Interview Link",
      content:
        "Generate a unique interview link to share with candidates. Each link is single-use and leads to the AI-powered interview.",
      placement: "left",
    },
    {
      target: '[data-tour="jobs-filter"]',
      title: "Search & Filter",
      content:
        "Use search and filters to quickly find job postings by title, format, or status.",
      placement: "bottom",
    },
  ],
};
