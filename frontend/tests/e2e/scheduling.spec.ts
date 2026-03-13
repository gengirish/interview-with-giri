import { test, expect } from "@playwright/test";
import { API_PATTERN, setAuthState, MOCK_JOBS } from "./helpers";

async function setupSchedulingMocks(page: import("@playwright/test").Page, options?: {
  generateLinkResponse?: { token: string; interview_url: string; ics_content?: string; scheduled_at?: string };
}) {
  const defaultResponse = {
    token: "test-token-123",
    interview_url: "http://localhost:3000/interview/test-token-123",
  };
  const scheduledResponse = options?.generateLinkResponse ?? {
    ...defaultResponse,
    ics_content: "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR",
    scheduled_at: "2026-02-01T14:00:00Z",
  };

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
      if (method === "GET" && !url.match(/\/job-postings\/[^/]+\//)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: MOCK_JOBS,
            total: MOCK_JOBS.length,
            page: 1,
            per_page: 10,
          }),
        });
      } else if (url.includes("/generate-link") && method === "POST") {
        const body = await route.request().postDataJSON().catch(() => ({}));
        if (body?.scheduled_at) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(scheduledResponse),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(defaultResponse),
          });
        }
      } else {
        await route.continue();
      }
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
    } else {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not mocked" }),
      });
    }
  });
}

test.describe("Interview Scheduling", () => {
  test.beforeEach(async ({ page }) => {
    await setupSchedulingMocks(page);
    await setAuthState(page);
  });

  test("generate link opens modal with scheduling option", async ({ page }) => {
    await page.goto("/dashboard/jobs");

    await expect(page.getByRole("heading", { name: "Job Postings" })).toBeVisible();
    await page.getByRole("button", { name: /Text Interview Link/i }).click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading", { name: "Generate Interview Link" })).toBeVisible();
    await expect(modal.getByRole("checkbox", { name: "Schedule interview" })).toBeVisible();
  });

  test("scheduling checkbox reveals date, time, and email fields", async ({ page }) => {
    await page.goto("/dashboard/jobs");

    await page.getByRole("button", { name: /Text Interview Link/i }).click();

    const modal = page.getByRole("dialog");
    await expect(modal.getByText("Schedule interview")).toBeVisible();
    await expect(modal.locator('input[type="date"]')).not.toBeVisible();

    await modal.getByRole("checkbox", { name: "Schedule interview" }).check();

    await expect(modal.locator('input[type="date"]')).toBeVisible();
    await expect(modal.locator('input[type="time"]')).toBeVisible();
    await expect(modal.getByPlaceholder("John Doe")).toBeVisible();
    await expect(modal.getByPlaceholder("candidate@example.com")).toBeVisible();
  });

  test("generating link without scheduling works", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-write"]);
    await page.goto("/dashboard/jobs");

    await page.getByRole("button", { name: /Text Interview Link/i }).click();

    const modal = page.getByRole("dialog");
    await expect(modal.getByRole("button", { name: "Generate Link" })).toBeVisible();
    await modal.getByRole("button", { name: "Generate Link" }).click();

    await expect(page.getByText("Link generated and copied to clipboard")).toBeVisible({
      timeout: 5000,
    });
    await expect(modal.getByRole("button", { name: "Done" })).toBeVisible();
  });

  test("generating link with scheduling shows calendar download", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-write"]);
    await page.goto("/dashboard/jobs");

    await page.getByRole("button", { name: /Text Interview Link/i }).click();

    const modal = page.getByRole("dialog");
    await modal.getByRole("checkbox", { name: "Schedule interview" }).check();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];
    await modal.locator('input[type="date"]').fill(dateStr);
    await modal.locator('input[type="time"]').fill("14:00");
    await modal.getByPlaceholder("candidate@example.com").fill("candidate@example.com");

    await modal.getByRole("button", { name: "Generate & Send Invite" }).click();

    await expect(page.getByText("Link generated and copied to clipboard")).toBeVisible({
      timeout: 5000,
    });
    await expect(modal.getByRole("button", { name: "Download Calendar Invite (.ics)" })).toBeVisible();
  });
});
