import { test, expect } from "@playwright/test";
import {
  setAuthState,
  setupDashboardMocks,
  API_PATTERN,
  MOCK_JOBS,
} from "./helpers";

const MOCK_SESSION_ID = "session-copilot-123";
const MOCK_COPILOT_ID = "copilot-456";

const MOCK_COPILOT_SESSION = {
  id: MOCK_COPILOT_ID,
  interview_session_id: MOCK_SESSION_ID,
  user_id: "user-1",
  status: "active",
  suggestions: [],
  competency_coverage: {},
  legal_alerts: [],
  started_at: "2024-01-15T10:00:00Z",
};

const MOCK_SUGGESTIONS = [
  {
    question: "Can you walk me through how you'd design the caching layer?",
    targets_skill: "System Design",
    rationale: "Candidate mentioned Redis but didn't explain their caching strategy",
    difficulty: "medium",
  },
  {
    question: "How do you handle database migrations in production?",
    targets_skill: "DevOps",
    rationale: "Uncovered competency for this role",
    difficulty: "medium",
  },
];

const MOCK_COVERAGE = {
  Python: { covered: true, depth: 2 },
  FastAPI: { covered: true, depth: 1 },
  PostgreSQL: { covered: false, depth: 0 },
};

const MOCK_MESSAGES = [
  {
    id: "msg-1",
    role: "interviewer",
    content: "Tell me about your Python experience.",
    media_url: null,
    created_at: "2024-01-15T10:00:00Z",
  },
  {
    id: "msg-2",
    role: "candidate",
    content: "I have 5 years of Python experience with FastAPI.",
    media_url: null,
    created_at: "2024-01-15T10:01:00Z",
  },
];

async function setupCopilotMocks(page: import("@playwright/test").Page) {
  await setupDashboardMocks(page, {
    interviews: {
      items: [
        {
          id: MOCK_SESSION_ID,
          job_posting_id: "job-1",
          token: "token-123",
          candidate_name: "Jane Doe",
          candidate_email: "jane@example.com",
          status: "in_progress",
          format: "text",
          overall_score: null,
          duration_seconds: null,
          started_at: "2024-01-15T10:00:00Z",
          completed_at: null,
          created_at: "2024-01-15T10:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      per_page: 10,
    },
  });

  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/copilot/start/") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_COPILOT_SESSION),
      });
    } else if (url.includes(`/copilot/${MOCK_COPILOT_ID}`)) {
      if (url.includes("/coverage") && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ coverage: MOCK_COVERAGE }),
        });
      } else if (url.includes("/suggest") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            suggestions: MOCK_SUGGESTIONS,
            uncovered_skills: ["PostgreSQL"],
          }),
        });
      } else if (url.includes("/end") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "ended" }),
        });
      } else if (method === "GET" && !url.includes("/coverage")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_COPILOT_SESSION),
        });
      } else {
        await route.continue();
      }
    } else if (url.includes(`/interviews/${MOCK_SESSION_ID}/messages`)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_MESSAGES),
      });
    } else if (url.includes(`/interviews/${MOCK_SESSION_ID}`) && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: MOCK_SESSION_ID,
          job_posting_id: "job-1",
          token: "token-123",
          candidate_name: "Jane Doe",
          candidate_email: "jane@example.com",
          status: "in_progress",
          format: "text",
          overall_score: null,
          duration_seconds: null,
          started_at: "2024-01-15T10:00:00Z",
          completed_at: null,
          created_at: "2024-01-15T10:00:00Z",
        }),
      });
    } else {
      await route.continue();
    }
  });
}

test.describe("Co-Pilot", () => {
  test.beforeEach(async ({ page }) => {
    await setupCopilotMocks(page);
    await setAuthState(page);
  });

  test("copilot page renders with left and right panels", async ({ page }) => {
    await page.goto(`/dashboard/copilot/${MOCK_SESSION_ID}`);

    await expect(page.getByRole("heading", { name: "AI Interview Co-Pilot" })).toBeVisible();
    await expect(page.getByText("Live Transcript")).toBeVisible();
    await expect(page.getByText("Follow-up Suggestions")).toBeVisible();
    await expect(page.getByText("Competency Coverage")).toBeVisible();
  });

  test("suggestion cards appear after clicking Get Suggestions", async ({ page }) => {
    await page.goto(`/dashboard/copilot/${MOCK_SESSION_ID}`);

    await expect(page.getByRole("button", { name: "Get Suggestions" })).toBeVisible();
    await page.getByRole("button", { name: "Get Suggestions" }).click();

    await expect(
      page.getByText("Can you walk me through how you'd design the caching layer?")
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("System Design")).toBeVisible();
    await expect(
      page.getByText("Candidate mentioned Redis but didn't explain their caching strategy")
    ).toBeVisible();
  });

  test("coverage grid shows skills", async ({ page }) => {
    await page.goto(`/dashboard/copilot/${MOCK_SESSION_ID}`);

    await page.getByRole("button", { name: "Get Suggestions" }).click();

    await expect(page.getByText("Python")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("FastAPI")).toBeVisible();
    await expect(page.getByText("PostgreSQL")).toBeVisible();
  });

  test("legal alert banner appears for risky questions", async ({ page }) => {
    const copilotWithAlerts = {
      ...MOCK_COPILOT_SESSION,
      legal_alerts: [
        {
          question: "How old are you?",
          is_risky: true,
          risk_type: "age_bias",
          severity: "warning",
          suggestion: "Ask about experience instead.",
        },
      ],
    };

    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/copilot/start/") && route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(copilotWithAlerts),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/dashboard/copilot/${MOCK_SESSION_ID}`);

    await expect(page.getByText("Legal / Bias Alerts")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("How old are you?")).toBeVisible();
    await expect(page.getByText("age_bias")).toBeVisible();
  });

  test("End Session button works", async ({ page }) => {
    await page.goto(`/dashboard/copilot/${MOCK_SESSION_ID}`);

    await expect(page.getByRole("button", { name: "End Session" })).toBeVisible();
    await page.getByRole("button", { name: "End Session" }).click();

    await expect(page).toHaveURL(/\/dashboard\/interviews/, { timeout: 5000 });
  });

  test("Launch Co-Pilot button on interview detail page", async ({ page }) => {
    await page.goto(`/dashboard/interviews/${MOCK_SESSION_ID}`);

    await expect(page.getByRole("link", { name: "Launch Co-Pilot" })).toBeVisible();
    await page.getByRole("link", { name: "Launch Co-Pilot" }).click();

    await expect(page).toHaveURL(new RegExp(`/dashboard/copilot/${MOCK_SESSION_ID}`), {
      timeout: 5000,
    });
  });

  test("copy button on suggestion cards", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-write"]);
    await page.goto(`/dashboard/copilot/${MOCK_SESSION_ID}`);

    await page.getByRole("button", { name: "Get Suggestions" }).click();

    await expect(
      page.getByText("Can you walk me through how you'd design the caching layer?")
    ).toBeVisible({ timeout: 5000 });

    const copyButtons = page.getByRole("button", { name: "Copy" });
    await expect(copyButtons.first()).toBeVisible();
    await copyButtons.first().click();

    await expect(page.getByText("Copied to clipboard")).toBeVisible({ timeout: 3000 });
  });

  test("Co-Pilot nav item links to copilot index", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/dashboard");

    const sidebar = page.getByTestId("sidebar");
    await sidebar.getByRole("link", { name: "Co-Pilot" }).click();

    await expect(page).toHaveURL(/\/dashboard\/copilot$/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "AI Interview Co-Pilot" })).toBeVisible();
  });
});
