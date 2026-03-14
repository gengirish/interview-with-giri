import { test, expect } from "@playwright/test";
import {
  setAuthState,
  setupDashboardMocks,
  API_PATTERN,
} from "./helpers";

const MOCK_SIM_ID = "sim-training-123";

const MOCK_SIMULATION = {
  id: MOCK_SIM_ID,
  role_type: "Software Engineer",
  candidate_persona: {
    name: "Alex Chen",
    experience_years: 5,
    skill_level: "senior",
    personality: "confident",
    background: "5 years at mid-size startup, full-stack engineer",
  },
  messages: [],
  status: "active",
  scorecard: null,
  duration_seconds: null,
  started_at: "2024-01-15T10:00:00Z",
  completed_at: null,
};

const MOCK_PERSONAS = [
  {
    name: "Alex Chen",
    experience_years: 5,
    skill_level: "senior",
    personality: "confident",
    hidden_strengths: ["system design"],
    hidden_weaknesses: ["time management"],
    background: "5 years at startup",
  },
  {
    name: "Jordan Smith",
    experience_years: 2,
    skill_level: "junior",
    personality: "nervous",
    hidden_strengths: ["quick learner"],
    hidden_weaknesses: ["public speaking"],
    background: "2 years at consulting firm",
  },
];

const MOCK_HISTORY = [
  {
    id: MOCK_SIM_ID,
    role_type: "Software Engineer",
    status: "completed",
    scorecard: { overall: 7.5 },
    duration_seconds: 300,
    started_at: "2024-01-15T10:00:00Z",
    completed_at: "2024-01-15T10:05:00Z",
  },
];

const MOCK_LEADERBOARD = [
  {
    user_id: "user-1",
    full_name: "Test User",
    email: "test@example.com",
    avg_score: 7.5,
    simulations_count: 3,
  },
];

const MOCK_SCORECARD = {
  overall: 7.5,
  question_quality: { score: 8, feedback: "Good mix of behavioral and technical" },
  competency_coverage: { score: 6, feedback: "Missed system design" },
  bias_avoidance: { score: 9, feedback: "No problematic questions" },
  candidate_experience: { score: 7, feedback: "Good rapport" },
  depth_vs_breadth: { score: 7, feedback: "Good balance" },
  time_management: { score: 6, feedback: "Spent 60% on one topic" },
  tips: ["Try the STAR method", "Ask follow-ups", "Cover all skills"],
};

async function setupTrainingMocks(page: import("@playwright/test").Page) {
  await setupDashboardMocks(page);

  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/training/start") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...MOCK_SIMULATION, id: "sim-new-456" }),
      });
    } else if (url.includes(`/training/${MOCK_SIM_ID}`)) {
      if (url.includes("/message") && method === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            response: `I have ${body.content?.length || 0} years of experience in that area.`,
          }),
        });
      } else if (url.includes("/end") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...MOCK_SIMULATION,
            status: "completed",
            scorecard: MOCK_SCORECARD,
            duration_seconds: 120,
            completed_at: "2024-01-15T10:02:00Z",
          }),
        });
      } else if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_SIMULATION),
        });
      } else {
        await route.continue();
      }
    } else if (url.includes("/training/history")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_HISTORY),
      });
    } else if (url.includes("/training/leaderboard")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LEADERBOARD),
      });
    } else if (url.includes("/training/personas")) {
      if (url.includes("/random") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PERSONAS[0]),
        });
      } else if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PERSONAS),
        });
      } else {
        await route.continue();
      }
    } else {
      await route.continue();
    }
  });
}

test.describe("Training", () => {
  test.beforeEach(async ({ page }) => {
    await setupTrainingMocks(page);
    await setAuthState(page);
  });

  test("training hub renders with hero and sections", async ({ page }) => {
    await page.goto("/dashboard/training");

    await expect(page.getByRole("heading", { name: "Practice Your Interview Skills" })).toBeVisible();
    await expect(page.getByText("Start Simulation")).toBeVisible();
    await expect(page.getByText("History")).toBeVisible();
    await expect(page.getByText("Leaderboard")).toBeVisible();
  });

  test("persona selector shows persona cards", async ({ page }) => {
    await page.goto("/dashboard/training");

    await expect(page.getByText("Alex Chen")).toBeVisible();
    await expect(page.getByText("Jordan Smith")).toBeVisible();
    await expect(page.getByText("senior")).toBeVisible();
    await expect(page.getByText("junior")).toBeVisible();
  });

  test("start simulation redirects to simulation page", async ({ page }) => {
    await page.goto("/dashboard/training");

    await page.getByRole("button", { name: "Start" }).click();

    await expect(page).toHaveURL(/\/dashboard\/training\/sim-new-456/, { timeout: 5000 });
  });

  test("simulation chat interface renders", async ({ page }) => {
    await page.goto(`/dashboard/training/${MOCK_SIM_ID}`);

    await expect(page.getByRole("heading", { name: /Interview Practice/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "End Interview" })).toBeVisible();
    await expect(page.getByPlaceholder("Ask your question...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });

  test("send message adds to chat", async ({ page }) => {
    await page.goto(`/dashboard/training/${MOCK_SIM_ID}`);

    await page.getByPlaceholder("Ask your question...").fill("Tell me about your experience.");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Tell me about your experience.")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/years of experience in that area/)).toBeVisible({ timeout: 5000 });
  });

  test("end interview shows scorecard", async ({ page }) => {
    await page.goto(`/dashboard/training/${MOCK_SIM_ID}`);

    await page.getByRole("button", { name: "End Interview" }).click();

    await expect(page.getByText("Your Scorecard")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("7.5")).toBeVisible();
    await expect(page.getByText("Question Quality")).toBeVisible();
    await expect(page.getByText("Try the STAR method")).toBeVisible();
    await expect(page.getByRole("link", { name: "Try Again" })).toBeVisible();
  });

  test("history list shows past simulations", async ({ page }) => {
    await page.goto("/dashboard/training");

    await expect(page.getByText("Software Engineer")).toBeVisible();
    await expect(page.getByText("7.5/10")).toBeVisible();
  });

  test("leaderboard shows team members", async ({ page }) => {
    await page.goto("/dashboard/training");

    await expect(page.getByText("Test User")).toBeVisible();
    await expect(page.getByText("7.5")).toBeVisible();
  });

  test("Training nav item links to training hub", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/dashboard");

    const sidebar = page.getByTestId("sidebar");
    await sidebar.getByRole("link", { name: "Training" }).click();

    await expect(page).toHaveURL(/\/dashboard\/training$/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Practice Your Interview Skills" })).toBeVisible();
  });
});
