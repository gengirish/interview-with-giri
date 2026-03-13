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
    await page.goto("/dashboard");

    await page.getByRole("link", { name: "Jobs" }).click();
    await expect(page).toHaveURL(/\/dashboard\/jobs/);

    await page.getByRole("link", { name: "Interviews" }).click();
    await expect(page).toHaveURL(/\/dashboard\/interviews/);

    await page.getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/dashboard\/analytics/);

    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings/);

    await page.getByRole("link", { name: "Team" }).click();
    await expect(page).toHaveURL(/\/dashboard\/team/);

    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
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
