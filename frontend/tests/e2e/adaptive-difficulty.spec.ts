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
  difficulty_progression: [
    { question: 1, difficulty: "medium" },
    { question: 2, difficulty: "hard" },
    { question: 3, difficulty: "expert" },
  ],
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

async function setupInterviewDetailMocks(page: import("@playwright/test").Page) {
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
      url.includes("/reports/sess-1") &&
      !url.includes("/comments") &&
      !url.includes("/highlights") &&
      !url.includes("/share") &&
      !url.includes("/export") &&
      !url.includes("/public/")
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

test.describe("Adaptive Difficulty", () => {
  test.beforeEach(async ({ page }) => {
    await setupInterviewDetailMocks(page);
    await setAuthState(page);
  });

  test("difficulty progression section is visible when data exists", async ({
    page,
  }) => {
    await page.goto("/dashboard/interviews/sess-1");

    await expect(page.getByText("Difficulty Progression")).toBeVisible({
      timeout: 15000,
    });
  });

  test("shows color-coded difficulty badges", async ({ page }) => {
    await page.goto("/dashboard/interviews/sess-1");

    await expect(page.getByText("Difficulty Progression")).toBeVisible({
      timeout: 15000,
    });
    const section = page
      .getByRole("heading", { name: "Difficulty Progression" })
      .locator("..");
    await expect(section.locator('[class*="bg-yellow-500"]')).toHaveCount(1);
    await expect(section.locator('[class*="bg-orange-500"]')).toHaveCount(1);
    await expect(section.locator('[class*="bg-red-500"]')).toHaveCount(1);
  });

  test("shows correct number of difficulty steps", async ({ page }) => {
    await page.goto("/dashboard/interviews/sess-1");

    await expect(page.getByText("Difficulty Progression")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Q1")).toBeVisible();
    await expect(page.getByText("Q2")).toBeVisible();
    await expect(page.getByText("Q3")).toBeVisible();
    await expect(page.getByText("medium", { exact: true })).toBeVisible();
    await expect(page.getByText("hard", { exact: true })).toBeVisible();
    await expect(page.getByText("expert", { exact: true })).toBeVisible();
  });
});
