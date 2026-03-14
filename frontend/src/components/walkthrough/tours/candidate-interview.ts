import type { TourDefinition } from "./index";

export const candidateInterviewTour: TourDefinition = {
  id: "candidate-interview",
  route: "/interview/[token]",
  steps: [
    {
      target: '[data-tour="consent-form"]',
      title: "Welcome, Candidate!",
      content:
        "Enter your name and email to get started. You can also upload your resume for a more personalized interview.",
      placement: "bottom",
      disableBeacon: true,
    },
    {
      target: '[data-tour="chat-interface"]',
      title: "Chat Interface",
      content:
        "Type your answers here. The AI interviewer will ask follow-up questions based on your responses.",
      placement: "top",
    },
    {
      target: '[data-tour="progress-indicator"]',
      title: "Interview Progress",
      content:
        "Track how far you are through the interview. The progress bar shows your current question number.",
      placement: "bottom",
    },
    {
      target: '[data-tour="interview-timer"]',
      title: "Time Remaining",
      content:
        "Keep an eye on the remaining time. The interview will automatically wrap up when time expires.",
      placement: "bottom",
    },
  ],
};
