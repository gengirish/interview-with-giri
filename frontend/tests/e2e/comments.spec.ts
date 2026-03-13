import { test, expect } from "@playwright/test";
import { API_PATTERN, setAuthState } from "./helpers";

const MOCK_COMMENTS = [
  {
    id: "c1",
    report_id: "report-1",
    user_id: "user-1",
    user_name: "John Admin",
    user_email: "john@example.com",
    content: "Great candidate! @alice@example.com what do you think?",
    mentioned_user_ids: ["user-2"],
    created_at: "2026-01-20T10:00:00Z",
  },
  {
    id: "c2",
    report_id: "report-1",
    user_id: "user-2",
    user_name: "Alice Manager",
    user_email: "alice@example.com",
    content: "I agree, strong technical skills.",
    mentioned_user_ids: [],
    created_at: "2026-01-20T11:00:00Z",
  },
];

const MOCK_ORG_MEMBERS = [
  { id: "user-1", email: "john@example.com", full_name: "John Admin" },
  { id: "user-2", email: "alice@example.com", full_name: "Alice Manager" },
];

const MOCK_SESSION_FOR_COMMENTS = {
  id: "session-1",
  job_posting_id: "job-1",
  token: "test-token",
  candidate_name: "Jane Doe",
  candidate_email: "jane@example.com",
  status: "completed",
  format: "text",
  overall_score: 8.5,
  duration_seconds: 1200,
  started_at: "2026-01-15T10:00:00Z",
  completed_at: "2026-01-15T10:20:00Z",
  created_at: "2026-01-15T09:00:00Z",
};

const MOCK_REPORT_FOR_COMMENTS = {
  id: "report-1",
  session_id: "session-1",
  candidate_name: "Jane Doe",
  overall_score: 8.5,
  skill_scores: { Python: { score: 9.0, evidence: "Strong" } },
  behavioral_scores: {},
  ai_summary: "Good candidate.",
  strengths: ["Strong Python"],
  concerns: [],
  recommendation: "hire",
  confidence_score: 0.85,
  created_at: "2026-01-15T10:25:00Z",
};

const MOCK_MESSAGES = [
  {
    id: "m1",
    role: "interviewer",
    content: "Tell me about yourself",
    media_url: null,
    created_at: "2026-01-15T10:01:00Z",
  },
  {
    id: "m2",
    role: "candidate",
    content: "I am a developer",
    media_url: null,
    created_at: "2026-01-15T10:02:00Z",
  },
];

async function setupInterviewDetailMocks(page: import("@playwright/test").Page, options?: {
  comments?: typeof MOCK_COMMENTS;
}) {
  const comments = options?.comments ?? MOCK_COMMENTS;

  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.match(/\/interviews\/session-1$/) && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SESSION_FOR_COMMENTS),
      });
    } else if (url.includes("/interviews/session-1/messages")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_MESSAGES),
      });
    } else if (url.includes("/reports/session-1") && !url.includes("/comments") && !url.includes("/share") && !url.includes("/export") && !url.includes("/public/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_REPORT_FOR_COMMENTS),
      });
    } else if (url.includes("/reports/session-1/comments")) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(comments),
        });
      } else if (method === "POST") {
        const body = route.request().postDataJSON?.() ?? {};
        const newComment = {
          id: "c3",
          report_id: "report-1",
          user_id: "user-1",
          user_name: "John Admin",
          user_email: "john@example.com",
          content: body.content ?? "New comment",
          mentioned_user_ids: [],
          created_at: new Date().toISOString(),
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(newComment),
        });
      } else if (method === "DELETE") {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      } else {
        await route.continue();
      }
    } else if (url.includes("/users/org-members")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_ORG_MEMBERS),
      });
    } else if (url.includes("/users/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "user-1",
          email: "john@example.com",
          full_name: "John Admin",
          role: "admin",
          is_active: true,
        }),
      });
    } else if (url.includes("/proctoring/integrity") || url.includes("/proctoring/summary")) {
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
            items: [{ id: "job-1", title: "Senior Engineer" }],
            total: 1,
            page: 1,
            per_page: 10,
          }),
        });
      } else {
        await route.continue();
      }
    } else if (url.includes("/interviews") && !url.includes("/session-1") && !url.includes("/public/")) {
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

test.describe("Team Collaboration - Comments", () => {
  test.beforeEach(async ({ page }) => {
    await setupInterviewDetailMocks(page);
    await setAuthState(page);
  });

  test("team discussion section is visible on interview detail page", async ({ page }) => {
    await page.goto("/dashboard/interviews/session-1");

    await expect(page.getByText("Team Discussion")).toBeVisible({
      timeout: 15000,
    });
  });

  test("existing comments are loaded and displayed", async ({ page }) => {
    await page.goto("/dashboard/interviews/session-1");

    await expect(page.getByText("John Admin")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Alice Manager")).toBeVisible();
    await expect(page.getByText("Great candidate!")).toBeVisible();
    await expect(page.getByText("I agree, strong technical skills.")).toBeVisible();
  });

  test("comment shows user name, content, and timestamp", async ({ page }) => {
    await page.goto("/dashboard/interviews/session-1");

    await expect(page.getByText("John Admin")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Great candidate!")).toBeVisible();
    await expect(page.getByText("Jan 20")).toBeVisible();
  });

  test("posting a new comment adds it to the thread", async ({ page }) => {
    await page.goto("/dashboard/interviews/session-1");

    await expect(page.getByRole("heading", { name: "Team Discussion" })).toBeVisible({
      timeout: 10000,
    });
    const textarea = page.getByPlaceholder("Add a comment...");
    await expect(textarea).toBeVisible();
    await textarea.fill("This is my new comment");
    await page.getByRole("button", { name: "Post" }).click();

    await expect(page.getByText("This is my new comment")).toBeVisible({ timeout: 5000 });
  });

  test("delete button is visible for comments", async ({ page }) => {
    await page.goto("/dashboard/interviews/session-1");

    await expect(page.getByText("John Admin")).toBeVisible({ timeout: 10000 });
    const deleteBtn = page.getByRole("button", { name: "Delete comment" });
    await expect(deleteBtn).toBeVisible();
  });

  test("@mentions are highlighted in comment content", async ({ page }) => {
    await page.goto("/dashboard/interviews/session-1");

    await expect(page.getByText("Great candidate!")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("@alice@example.com", { exact: true })).toBeVisible();
    const mentionSpan = page.locator("span.text-blue-600").filter({ hasText: "@alice@example.com" });
    await expect(mentionSpan).toBeVisible();
  });
});
