import { test, expect } from "@playwright/test";
import { API_PATTERN, setAuthState } from "./helpers";

const MOCK_SESSION = {
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

const MOCK_REPORT = {
  id: "report-1",
  session_id: "session-1",
  candidate_name: "Jane Doe",
  overall_score: 8.5,
  skill_scores: { Python: { score: 9.0, evidence: "Strong Python skills" } },
  behavioral_scores: {
    communication: { score: 8.0, evidence: "Clear communicator" },
  },
  ai_summary: "Excellent candidate with strong technical skills.",
  strengths: ["Strong Python", "Good communication"],
  concerns: ["Limited system design experience"],
  recommendation: "hire",
  confidence_score: 0.85,
  created_at: "2026-01-15T10:25:00Z",
};

const SHARE_RESPONSE = {
  share_url: "http://localhost:3000/reports/shared/abc123",
  share_token: "abc123",
  expires_at: "2026-01-18T10:00:00Z",
};

async function setupInterviewDetailMocks(page: import("@playwright/test").Page) {
  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/dashboard/stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total_interviews: 42,
          completed_interviews: 38,
          active_jobs: 5,
          avg_score: 78.5,
          interviews_this_month: 12,
          pass_rate: 85,
        }),
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
    } else if (url.includes("/interviews/session-1/messages")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else if (url.includes("/interviews/session-1") && !url.includes("/messages") && !url.includes("/public/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SESSION),
      });
    } else if (url.includes("/reports/session-1/share") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SHARE_RESPONSE),
      });
    } else if (url.includes("/reports/session-1") && !url.includes("/share") && !url.includes("/public/") && !url.includes("/comments") && !url.includes("/export")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_REPORT),
      });
    } else if (url.includes("/reports/") && url.includes("/comments")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else if (url.includes("/interviews") && !url.includes("/public/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, page: 1, per_page: 10 }),
      });
    } else if (url.includes("/analytics/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    } else if (url.includes("/users") && !url.includes("/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else if (url.includes("/integrity")) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not found" }),
      });
    } else if (url.includes("/users/me/walkthrough")) {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ completed: {}, skipped: {}, version: 1 }),
        });
      } else if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ completed: {}, skipped: {}, version: 1 }),
        });
      } else {
        await route.continue();
      }
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
    } else if (url.includes("/users/org-members")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
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

test.describe("Shareable Report Links", () => {
  test("share report button is visible when report exists", async ({
    page,
  }) => {
    await setupInterviewDetailMocks(page);
    await setAuthState(page);
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem(
        "walkthrough_progress",
        JSON.stringify({ completed: { "interview-detail": true }, skipped: {}, version: 1 })
      );
    });
    await page.goto("/dashboard/interviews/session-1");

    await expect(page.getByRole("button", { name: "Share Report" })).toBeVisible({
      timeout: 15000,
    });
  });

  test("clicking share copies URL to clipboard and shows toast", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-write"]);
    await setupInterviewDetailMocks(page);
    await setAuthState(page);
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem(
        "walkthrough_progress",
        JSON.stringify({ completed: { "interview-detail": true }, skipped: {}, version: 1 })
      );
    });
    await page.goto("/dashboard/interviews/session-1");

    await expect(page.getByRole("button", { name: "Share Report" })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "Share Report" }).click();

    await expect(
      page.getByText("Share link copied to clipboard")
    ).toBeVisible({ timeout: 5000 });
  });

  test("public shared report page renders report data", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/reports/public/abc123")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_REPORT),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/reports/shared/abc123");

    await expect(
      page.getByRole("heading", { name: "Shared Interview Report" })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Candidate: Jane Doe")).toBeVisible();
    await expect(page.getByText("Excellent candidate with strong technical skills.")).toBeVisible();
    await expect(page.getByText("Strong Python", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Limited system design experience")).toBeVisible();
  });

  test("public shared report shows expired message for expired token", async ({
    page,
  }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/reports/public/expired-token")) {
        await route.fulfill({
          status: 410,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Link expired" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/reports/shared/expired-token");

    await expect(
      page.getByRole("heading", { name: "This shared link has expired" })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText(/Shared report links expire after a set time/)
    ).toBeVisible();
  });

  test("public shared report shows not found for invalid token", async ({
    page,
  }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/reports/public/invalid-token")) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Not found" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/reports/shared/invalid-token");

    await expect(
      page.getByRole("heading", { name: "Report not found" })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText(/This link may be invalid or the report may have been removed/)
    ).toBeVisible();
  });
});
