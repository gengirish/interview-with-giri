import { test, expect } from "@playwright/test";
import {
  setAuthState,
  setupDashboardMocks,
  API_PATTERN,
} from "./helpers";

const MOCK_COMPANY_VALUES = {
  id: "cv-1",
  org_id: "org-123",
  values: [
    {
      name: "Ownership",
      definition: "Taking responsibility for outcomes",
      weight: 0.5,
      behavioral_indicators: ["initiative", "follow-through"],
    },
    {
      name: "Integrity",
      definition: "Honesty and ethical behavior",
      weight: 0.5,
      behavioral_indicators: ["transparency", "accountability"],
    },
  ],
  updated_at: "2026-01-15T10:00:00Z",
};

const MOCK_GENERATED_QUESTIONS = {
  questions: {
    Ownership: [
      { question: "Tell me about a time when you took ownership of a project.", probes: ["What was the outcome?"] },
      { question: "Describe a situation where you had to follow through on a commitment.", probes: ["What challenges did you face?"] },
    ],
    Integrity: [
      { question: "Tell me about a time you had to make an ethical decision.", probes: ["How did you approach it?"] },
    ],
  },
};

const MOCK_VALUES_ASSESSMENT = {
  id: "va-1",
  session_id: "sess-1",
  value_scores: {
    Ownership: { score: 7.5, confidence: 0.85, evidence: ["Candidate described taking initiative on the migration project."] },
    Integrity: { score: 8.0, confidence: 0.9, evidence: ["Candidate emphasized transparency in decision-making."] },
  },
  overall_fit_score: 7.75,
  fit_label: "Good Fit",
  ai_narrative: "The candidate demonstrated strong alignment with both Ownership and Integrity values. Their examples showed concrete instances of taking initiative and acting with transparency.",
  created_at: "2026-01-15T11:00:00Z",
};

const MOCK_SUBSCRIPTION = {
  plan_tier: "professional",
  interviews_limit: 200,
  interviews_used: 10,
  interviews_remaining: 190,
  can_interview: true,
  allowed_formats: ["text", "voice"],
  status: "active",
};

async function setupValuesMocks(
  page: import("@playwright/test").Page,
  options?: {
    values?: typeof MOCK_COMPANY_VALUES | null;
    assessment?: typeof MOCK_VALUES_ASSESSMENT | null;
    emptyValues?: boolean;
  }
) {
  const values = options?.emptyValues ? null : (options?.values ?? MOCK_COMPANY_VALUES);
  const assessment = options?.assessment ?? null;

  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/billing/subscription")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SUBSCRIPTION),
      });
    } else if (url.includes("/billing/plans")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else if (url.includes("/values") && !url.includes("/assess/") && !url.includes("/assessment/") && !url.includes("/generate-questions") && !url.includes("/org-trends")) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(values),
        });
      } else if (method === "PUT") {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "cv-1",
            org_id: "org-123",
            values: body?.values ?? [],
            updated_at: new Date().toISOString(),
          }),
        });
      } else {
        await route.continue();
      }
    } else if (url.includes("/values/generate-questions") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_GENERATED_QUESTIONS),
      });
    } else if (url.includes("/values/assess/") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_VALUES_ASSESSMENT),
      });
    } else if (url.includes("/values/assessment/") && method === "GET") {
      if (assessment) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(assessment),
        });
      } else {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not found" }) });
      }
    } else if (url.includes("/values/org-trends")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          avg_value_scores: { Ownership: 7.5, Integrity: 8.0 },
          overall_avg_fit: 7.75,
          assessment_count: 5,
        }),
      });
    } else {
      await route.continue();
    }
  });
}

const LS_WALKTHROUGH = "walkthrough_progress";

/** Skip the settings-page walkthrough so the joyride overlay doesn't block clicks. */
async function skipSettingsWalkthrough(page: import("@playwright/test").Page) {
  await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    let state: { completed: Record<string, boolean>; skipped: Record<string, boolean>; version: number } = {
      completed: {},
      skipped: {},
      version: 1,
    };
    try {
      if (raw) state = { ...state, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    state.skipped = { ...state.skipped, "settings-page": true };
    localStorage.setItem(key, JSON.stringify(state));
  }, LS_WALKTHROUGH);
}

/** Skip the interview-detail walkthrough so the joyride overlay doesn't block clicks. */
async function skipInterviewDetailWalkthrough(page: import("@playwright/test").Page) {
  await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    let state: { completed: Record<string, boolean>; skipped: Record<string, boolean>; version: number } = {
      completed: {},
      skipped: {},
      version: 1,
    };
    try {
      if (raw) state = { ...state, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    state.skipped = { ...state.skipped, "interview-detail": true };
    localStorage.setItem(key, JSON.stringify(state));
  }, LS_WALKTHROUGH);
}

test.describe("Company Values", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
    await skipSettingsWalkthrough(page);
  });

  test("values section in settings renders", async ({ page }) => {
    await setupValuesMocks(page);
    await page.goto("/dashboard/settings");

    await page.getByRole("tab", { name: "Company Values" }).click();
    await expect(page.getByRole("heading", { name: "Company Values" })).toBeVisible();
    await expect(page.getByText("Define your organization")).toBeVisible();
  });

  test("current values list displays", async ({ page }) => {
    await setupValuesMocks(page);
    await page.goto("/dashboard/settings");

    await page.getByRole("tab", { name: "Company Values" }).click();
    await expect(page.getByText("Ownership")).toBeVisible();
    await expect(page.getByText("Integrity")).toBeVisible();
    await expect(page.getByText("Taking responsibility for outcomes")).toBeVisible();
  });

  test("add value form appears when clicking Add Value", async ({ page }) => {
    await setupValuesMocks(page);
    await page.goto("/dashboard/settings");

    await page.getByRole("tab", { name: "Company Values" }).click();
    await page.getByRole("button", { name: "Add Value" }).click();
    await expect(page.getByPlaceholder("e.g. Ownership")).toBeVisible();
    await expect(page.getByPlaceholder("What this value means to your organization...")).toBeVisible();
  });

  test("generate questions button shows generated questions", async ({ page }) => {
    await setupValuesMocks(page);
    await page.goto("/dashboard/settings");

    await page.getByRole("tab", { name: "Company Values" }).click();
    await page.getByRole("button", { name: "Generate Questions" }).click();
    await expect(page.getByText("Generated Questions")).toBeVisible();
    await expect(page.getByText("Tell me about a time when you took ownership of a project.")).toBeVisible();
  });

  test("empty state when no values", async ({ page }) => {
    await setupValuesMocks(page, { emptyValues: true });
    await page.goto("/dashboard/settings");

    await page.getByRole("tab", { name: "Company Values" }).click();
    await expect(page.getByText("No values defined yet")).toBeVisible();
  });
});

test.describe("Cultural Fit tab on interview detail", () => {
  const MOCK_SESSION = {
    id: "sess-1",
    job_posting_id: "job-1",
    token: "test-token",
    candidate_name: "Alice Smith",
    candidate_email: "alice@example.com",
    status: "completed",
    format: "text",
    overall_score: 8.5,
    duration_seconds: 1800,
    started_at: "2026-01-15T10:00:00Z",
    completed_at: "2026-01-15T10:30:00Z",
    created_at: "2026-01-15T09:50:00Z",
  };

  const MOCK_REPORT = {
    id: "report-1",
    session_id: "sess-1",
    candidate_name: "Alice Smith",
    overall_score: 8.5,
    skill_scores: {},
    behavioral_scores: {},
    ai_summary: "Good",
    strengths: [],
    concerns: [],
    recommendation: "strong_hire",
    confidence_score: 0.9,
    created_at: "2026-01-15T10:35:00Z",
  };

  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
    await skipInterviewDetailWalkthrough(page);
  });

  test("cultural fit tab visible and navigates", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/interviews/sess-1") && !url.includes("/messages") && !url.includes("/comments")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_SESSION),
        });
      } else if (url.includes("/reports/sess-1") && !url.includes("/reports/sess-1/")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_REPORT),
        });
      } else if (url.includes("/interviews/sess-1/messages")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      } else if (url.includes("/values/assessment/sess-1")) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not found" }) });
      } else if (url.includes("/proctoring/")) {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      } else if (url.includes("/reports/sess-1/comments")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      } else if (
        (url.includes("/users/org-members") || (url.includes("/users/me") && !url.includes("/walkthrough")))
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "user-1",
            email: "admin@test.com",
            full_name: "Admin",
            role: "admin",
            is_active: true,
            created_at: "2026-01-01T00:00:00Z",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/interviews/sess-1");

    await page.getByRole("tab", { name: "Cultural Fit" }).click();
    await expect(page.getByRole("heading", { name: "Cultural Fit", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No cultural fit assessment yet" })).toBeVisible();
  });

  test("run assessment button and results", async ({ page }) => {
    let assessmentReturned = false;
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes("/interviews/sess-1") && !url.includes("/messages") && !url.includes("/comments")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_SESSION),
        });
      } else if (url.includes("/reports/sess-1") && !url.includes("/reports/sess-1/")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_REPORT),
        });
      } else if (url.includes("/interviews/sess-1/messages")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      } else if (url.includes("/values/assessment/sess-1") && method === "GET") {
        await route.fulfill({
          status: assessmentReturned ? 200 : 404,
          contentType: "application/json",
          body: assessmentReturned ? JSON.stringify(MOCK_VALUES_ASSESSMENT) : JSON.stringify({ detail: "Not found" }),
        });
      } else if (url.includes("/values/assess/sess-1") && method === "POST") {
        assessmentReturned = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_VALUES_ASSESSMENT),
        });
      } else if (url.includes("/proctoring/")) {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      } else if (url.includes("/reports/sess-1/comments")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      } else if (
        (url.includes("/users/org-members") || (url.includes("/users/me") && !url.includes("/walkthrough")))
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "user-1",
            email: "admin@test.com",
            full_name: "Admin",
            role: "admin",
            is_active: true,
            created_at: "2026-01-01T00:00:00Z",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/interviews/sess-1");
    await page.getByRole("tab", { name: "Cultural Fit" }).click();

    await page.getByRole("button", { name: "Run Assessment" }).click();

    await expect(page.getByText("Good Fit")).toBeVisible();
    await expect(page.getByText("7.8")).toBeVisible();
    await expect(page.getByText("Evidence by Value")).toBeVisible();
    await expect(page.getByText("AI Assessment")).toBeVisible();
  });

  test("evidence cards expandable", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/interviews/sess-1") && !url.includes("/messages") && !url.includes("/comments")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_SESSION),
        });
      } else if (url.includes("/reports/sess-1") && !url.includes("/reports/sess-1/")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_REPORT),
        });
      } else if (url.includes("/interviews/sess-1/messages")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      } else if (url.includes("/values/assessment/sess-1")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_VALUES_ASSESSMENT),
        });
      } else if (url.includes("/proctoring/")) {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      } else if (url.includes("/reports/sess-1/comments")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      } else if (
        (url.includes("/users/org-members") || (url.includes("/users/me") && !url.includes("/walkthrough")))
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "user-1",
            email: "admin@test.com",
            full_name: "Admin",
            role: "admin",
            is_active: true,
            created_at: "2026-01-01T00:00:00Z",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/interviews/sess-1");
    await page.getByRole("tab", { name: "Cultural Fit" }).click();

    await expect(page.getByText("Good Fit")).toBeVisible();
    // Use button selectors to avoid strict mode (Ownership/Integrity appear in radar chart and evidence cards)
    await expect(page.getByRole("button", { name: /Ownership/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Integrity/ })).toBeVisible();
    // Click to expand first evidence card
    await page.getByRole("button", { name: /Ownership/ }).click();
    await expect(page.getByText("Candidate described taking initiative on the migration project.")).toBeVisible();
  });
});
