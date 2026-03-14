import type { TourDefinition } from "./index";

export const landingTour: TourDefinition = {
  id: "landing-overview",
  route: "/",
  steps: [
    {
      target: '[data-tour="hero"]',
      title: "Welcome to Interview Bot",
      content:
        "This platform automates your hiring interviews with AI. Create job postings, send candidates a link, and get structured reports — all hands-free.",
      placement: "bottom",
      disableBeacon: true,
    },
    {
      target: '[data-tour="features"]',
      title: "Multiple Interview Formats",
      content:
        "Choose from text chat, voice, video, or live coding interviews. Each format is designed for different role types.",
      placement: "top",
    },
    {
      target: '[data-tour="how-it-works"]',
      title: "How It Works",
      content:
        "Four simple steps: create a job posting, configure the interview, share the link, and review AI-generated reports.",
      placement: "top",
    },
    {
      target: '[data-tour="pricing"]',
      title: "Flexible Pricing",
      content:
        "Start free with 10 interviews per month. Upgrade to Pro or Enterprise as your hiring needs grow.",
      placement: "top",
    },
    {
      target: '[data-tour="cta"]',
      title: "Get Started",
      content:
        "Create your free account to start running AI-powered interviews today.",
      placement: "top",
    },
  ],
};
