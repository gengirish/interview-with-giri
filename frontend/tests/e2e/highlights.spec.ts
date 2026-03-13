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
  {
    id: "msg-3",
    role: "interviewer",
    content: "How would you design a microservices architecture?",
    media_url: null,
    created_at: "2026-01-15T10:05:00Z",
  },
  {
    id: "msg-4",
    role: "candidate",
    content: "I would use event-driven architecture with message queues.",
    media_url: null,
    created_at: "2026-01-15T10:07:00Z",
  },
];

const MOCK_HIGHLIGHTS = {
  highlights: [
    {
      message_index: 1,
      type: "strong_answer",
      label: "Deep Python expertise",
      summary:
        "Candidate demonstrated deep knowledge of Python internals.",
      speaker: "candidate",
      timestamp: "2026-01-15T10:01:00Z",
      content_preview: "I have 5 years of Python experience.",
    },
    {
      message_index: 3,
      type: "creative_thinking",
      label: "Innovative architecture approach",
      summary:
        "Proposed event-driven architecture showing strong system design.",
      speaker: "candidate",
      timestamp: "2026-01-15T10:07:00Z",
      content_preview:
        "I would use event-driven architecture with message queues.",
    },
    {
      message_index: 2,
      type: "deep_insight",
      label: "Thoughtful system design question",
      summary: "Interviewer probed deeper into architectural thinking.",
      speaker: "interviewer",
      timestamp: "2026-01-15T10:05:00Z",
      content_preview:
        "How would you design a microservices architecture?",
    },
  ],
  session_id: "sess-1",
};

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
        body: JSON.stringify(MOCK_HIGHLIGHTS),
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

test.describe("AI Highlights", () => {
  test.beforeEach(async ({ page }) => {
    await setupInterviewDetailMocks(page);
    await setAuthState(page);
  });

  test("Highlights tab is visible on interview detail page", async ({
    page,
  }) => {
    await page.goto("/dashboard/interviews/sess-1");

    await expect(page.getByRole("tab", { name: "Highlights" })).toBeVisible({
      timeout: 15000,
    });
  });

  test("clicking Highlights tab loads and displays highlights", async ({
    page,
  }) => {
    await page.goto("/dashboard/interviews/sess-1");

    await page.getByRole("tab", { name: "Highlights" }).click();

    await expect(page.getByText("AI Highlights")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Deep Python expertise")).toBeVisible();
    await expect(page.getByText("Innovative architecture approach")).toBeVisible();
    await expect(page.getByText("Thoughtful system design question")).toBeVisible();
  });

  test("highlights show correct type badges and labels", async ({ page }) => {
    await page.goto("/dashboard/interviews/sess-1");
    await page.getByRole("tab", { name: "Highlights" }).click();

    await expect(page.getByText("Deep Python expertise")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("strong answer")).toBeVisible();
    await expect(page.getByText("creative thinking")).toBeVisible();
    await expect(page.getByText("deep insight")).toBeVisible();
  });

  test("highlights show content preview and summary", async ({ page }) => {
    await page.goto("/dashboard/interviews/sess-1");
    await page.getByRole("tab", { name: "Highlights" }).click();

    await expect(
      page.getByText("Candidate demonstrated deep knowledge of Python internals.")
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText("I have 5 years of Python experience.")
    ).toBeVisible();
  });

  test("highlights have correct color coding", async ({ page }) => {
    await page.goto("/dashboard/interviews/sess-1");
    await page.getByRole("tab", { name: "Highlights" }).click();

    await expect(page.getByText("AI Highlights")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("strong answer").first()).toHaveClass(
      /bg-emerald-500/
    );
    await expect(page.getByText("creative thinking").first()).toHaveClass(
      /bg-violet-500/
    );
  });
});
