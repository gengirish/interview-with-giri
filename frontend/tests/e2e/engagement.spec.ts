import { test, expect } from "@playwright/test";
import { API_PATTERN, setAuthState, MOCK_ORG_ID } from "./helpers";

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
  skill_scores: { Python: { score: 9.0, evidence: "Strong", notes: "" } },
  behavioral_scores: {
    communication: { score: 8.0, evidence: "Clear", notes: "" },
  },
  ai_summary: "Excellent candidate with strong Python skills.",
  strengths: ["Strong Python", "Clear communication"],
  concerns: ["Could improve system design"],
  recommendation: "strong_hire",
  confidence_score: 0.9,
  created_at: "2026-01-15T10:35:00Z",
};

const MOCK_ENGAGEMENT = {
  engagement_profile: {
    overall_engagement: 0.75,
    response_speed: {
      avg_ms: 12000,
      trend: "improving",
      consistency: 0.85,
      per_question: [
        { q: 1, ms: 15000 },
        { q: 2, ms: 10000 },
        { q: 3, ms: 11000 },
      ],
    },
    confidence_pattern: {
      avg: 0.7,
      arc: [
        { q: 1, v: 0.65 },
        { q: 2, v: 0.72 },
        { q: 3, v: 0.73 },
      ],
    },
    elaboration_trend: { avg_depth: 3.5, trend: "increasing" },
    notable_signals: [
      {
        type: "confidence_spike",
        question_index: 2,
        detail: "High assertiveness on Q2",
      },
      {
        type: "hesitation_cluster",
        question_index: 1,
        detail: "Significant hedging on Q1",
      },
    ],
  },
};

const MOCK_MESSAGES = [
  {
    id: "msg-1",
    role: "interviewer",
    content: "Tell me about your experience with Python.",
    media_url: null,
    created_at: "2026-01-15T10:00:00Z",
  },
  {
    id: "msg-2",
    role: "candidate",
    content: "I have 5 years of Python experience.",
    media_url: null,
    created_at: "2026-01-15T10:01:00Z",
  },
];

async function setupEngagementMocks(page: import("@playwright/test").Page) {
  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.match(/\/interviews\/sess-1$/) && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SESSION),
      });
    } else if (url.includes("/interviews/sess-1/messages")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_MESSAGES),
      });
    } else if (
      url.includes("/reports/report-1/engagement")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_ENGAGEMENT),
      });
    } else if (
      url.includes("/reports/sess-1") &&
      !url.includes("/comments") &&
      !url.includes("/highlights") &&
      !url.includes("/share") &&
      !url.includes("/export") &&
      !url.includes("/public/") &&
      !url.includes("/engagement")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_REPORT),
      });
    } else if (url.includes("/reports/sess-1/highlights")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ highlights: [], session_id: "sess-1" }),
      });
    } else if (url.includes("/reports/sess-1/comments")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else if (url.includes("/proctoring/summary/sess-1")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    } else if (url.includes("/proctoring/integrity/sess-1")) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not found" }),
      });
    } else if (url.includes("/job-postings") && !url.includes("/extract-skills")) {
      if (method === "GET" && !url.match(/\/job-postings\/[^/]+$/)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [{ id: "job-1", title: "Senior Engineer", org_id: MOCK_ORG_ID }],
            total: 1,
            page: 1,
            per_page: 10,
          }),
        });
      } else {
        await route.continue();
      }
    } else if (url.includes("/users/org-members")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else if (url.includes("/users/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "user-1",
          email: "admin@example.com",
          full_name: "Admin",
          role: "admin",
          is_active: true,
        }),
      });
    } else if (
      url.includes("/interviews") &&
      !url.includes("/sess-1") &&
      !url.includes("/public/")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, page: 1, per_page: 10 }),
      });
    } else if (url.includes("/analytics/") || url.includes("/dashboard/stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not mocked" }),
      });
    }
  });
}

test.describe("Engagement", () => {
  test.beforeEach(async ({ page }) => {
    await setupEngagementMocks(page);
    await setAuthState(page);
  });

  test("Engagement tab is visible on interview detail page", async ({
    page,
  }) => {
    await page.goto("/dashboard/interviews/sess-1");

    await expect(page.getByRole("tab", { name: "Engagement" })).toBeVisible({
      timeout: 15000,
    });
  });

  test("clicking Engagement tab loads and displays engagement section", async ({
    page,
  }) => {
    await page.goto("/dashboard/interviews/sess-1");

    await page.getByRole("tab", { name: "Engagement" }).click();

    await expect(page.getByText("Overall Engagement")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("75%")).toBeVisible();
  });

  test("overall engagement badge displays percentage", async ({ page }) => {
    await page.goto("/dashboard/interviews/sess-1");
    await page.getByRole("tab", { name: "Engagement" }).click();

    await expect(page.getByText("75%")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Overall Engagement")).toBeVisible();
  });

  test("confidence timeline chart appears when data available", async ({
    page,
  }) => {
    await page.goto("/dashboard/interviews/sess-1");
    await page.getByRole("tab", { name: "Engagement" }).click();

    await expect(page.getByText("Confidence Timeline")).toBeVisible({
      timeout: 5000,
    });
  });

  test("response speed chart appears when per-question data available", async ({
    page,
  }) => {
    await page.goto("/dashboard/interviews/sess-1");
    await page.getByRole("tab", { name: "Engagement" }).click();

    await expect(page.getByText("Response Speed")).toBeVisible({
      timeout: 5000,
    });
  });

  test("trend indicators display correctly", async ({ page }) => {
    await page.goto("/dashboard/interviews/sess-1");
    await page.getByRole("tab", { name: "Engagement" }).click();

    await expect(page.getByText("Improving ↑")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Increasing ↑")).toBeVisible();
  });

  test("notable signals cards appear", async ({ page }) => {
    await page.goto("/dashboard/interviews/sess-1");
    await page.getByRole("tab", { name: "Engagement" }).click();

    await expect(page.getByText("Notable Signals")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("High assertiveness on Q2")).toBeVisible();
    await expect(page.getByText("Significant hedging on Q1")).toBeVisible();
  });
});
