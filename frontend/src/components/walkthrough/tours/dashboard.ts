import type { TourDefinition } from "./index";

export const dashboardTour: TourDefinition = {
  id: "dashboard-overview",
  route: "/dashboard",
  steps: [
    {
      target: '[data-tour="stats-cards"]',
      title: "Your Hiring Metrics",
      content:
        "See an overview of active jobs, total interviews, completion rates, and average scores at a glance.",
      placement: "bottom",
      disableBeacon: true,
    },
    {
      target: '[data-tour="getting-started"]',
      title: "Getting Started Checklist",
      content:
        "Follow these four steps to run your first AI interview: create a job, configure the format, share the link, then review reports.",
      placement: "right",
    },
    {
      target: '[data-tour="quick-actions"]',
      title: "Quick Actions",
      content:
        "Jump to common tasks like creating a new job posting or viewing recent interviews from here.",
      placement: "left",
    },
    {
      target: '[data-testid="sidebar"]',
      title: "Navigation",
      content:
        "Use the sidebar to switch between Jobs, Interviews, Reports, Analytics, and more. Admin-only sections like Team and Settings appear based on your role.",
      placement: "right",
    },
  ],
};
