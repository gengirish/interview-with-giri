import type { TourDefinition } from "./index";

export const interviewDetailTour: TourDefinition = {
  id: "interview-detail",
  route: "/dashboard/interviews/[id]",
  steps: [
    {
      target: '[data-tour="scorecard"]',
      title: "AI Scorecard",
      content:
        "The AI scores candidates across multiple dimensions — technical skills, behavioral traits, and communication. Each dimension includes evidence from the conversation.",
      placement: "bottom",
      disableBeacon: true,
    },
    {
      target: '[data-tour="transcript"]',
      title: "Interview Transcript",
      content:
        "Read the full conversation between the AI interviewer and the candidate, including follow-up questions and responses.",
      placement: "top",
    },
    {
      target: '[data-tour="highlights"]',
      title: "Key Highlights",
      content:
        "The AI flags notable moments — strong answers, areas of concern, and standout skills demonstrated during the interview.",
      placement: "top",
    },
    {
      target: '[data-tour="discussion"]',
      title: "Team Discussion",
      content:
        "Leave comments and @mention team members to discuss the candidate. Collaborate on hiring decisions right here.",
      placement: "top",
    },
    {
      target: '[data-tour="export"]',
      title: "Export Report",
      content:
        "Download the candidate report as JSON, CSV, or Excel. Share it with stakeholders who don't have platform access.",
      placement: "left",
    },
  ],
};
