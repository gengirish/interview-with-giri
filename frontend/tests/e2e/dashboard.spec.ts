import { test, expect } from "@playwright/test";
import {
  setAuthState,
  setupDashboardMocks,
  MOCK_DASHBOARD_STATS,
} from "./helpers";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("dashboard loads and shows stats cards", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(
      page.getByText(String(MOCK_DASHBOARD_STATS.active_jobs), { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(String(MOCK_DASHBOARD_STATS.total_interviews), {
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByText(String(MOCK_DASHBOARD_STATS.completed_interviews), {
        exact: true,
      })
    ).toBeVisible();
  });

  test("navigation sidebar links work", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.evaluate(() => {
      const allTours = [
        "dashboard-overview",
        "jobs-page",
        "interviews-page",
        "interview-detail",
        "reports-page",
        "compare-page",
        "analytics-page",
        "settings-page",
        "team-page",
      ];
      const completed = Object.fromEntries(allTours.map((t) => [t, true]));
      localStorage.setItem(
        "walkthrough_progress",
        JSON.stringify({ completed, skipped: {}, version: 1 })
      );
    });
    await page.goto("/dashboard");

    const sidebar = page.getByTestId("sidebar");
    await sidebar.getByRole("link", { name: "Jobs" }).click();
    await expect(page).toHaveURL(/\/dashboard\/jobs/, { timeout: 5000 });

    await Promise.all([
      page.waitForURL(/\/dashboard\/interviews/, { timeout: 5000 }),
      sidebar.getByRole("link", { name: "Interviews" }).click(),
    ]);

    await Promise.all([
      page.waitForURL(/\/dashboard\/analytics/, { timeout: 5000 }),
      sidebar.getByRole("link", { name: "Analytics" }).click(),
    ]);

    await Promise.all([
      page.waitForURL(/\/dashboard\/settings/, { timeout: 5000 }),
      sidebar.getByRole("link", { name: "Settings" }).click(),
    ]);

    await Promise.all([
      page.waitForURL(/\/dashboard\/team/, { timeout: 10000 }),
      sidebar.getByRole("link", { name: "Team" }).click(),
    ]);

    await Promise.all([
      page.waitForURL(/\/dashboard$/, { timeout: 10000 }),
      sidebar.getByRole("link", { name: "Dashboard" }).click(),
    ]);
  });

  test("empty state displays when no data", async ({ page }) => {
    await setupDashboardMocks(page, { emptyJobs: true });
    await page.goto("/dashboard/jobs");

    await expect(page.getByText("No job postings yet")).toBeVisible();
    await expect(
      page.getByText("Create your first job posting to start interviewing candidates.")
    ).toBeVisible();
  });
});
