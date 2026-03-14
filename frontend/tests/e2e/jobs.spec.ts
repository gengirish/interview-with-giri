import { test, expect } from "@playwright/test";
import {
  setAuthState,
  setupDashboardMocks,
  MOCK_JOBS,
} from "./helpers";

test.describe("Jobs", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("job list page renders with mocked jobs", async ({ page }) => {
    await page.goto("/dashboard/jobs");

    await expect(
      page.getByRole("heading", { name: "Job Postings" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: MOCK_JOBS[0].title })
    ).toBeVisible();
    await expect(page.getByText(MOCK_JOBS[0].job_description)).toBeVisible();
  });

  test("create job form appears and validates required fields", async ({
    page,
  }) => {
    await page.goto("/dashboard/jobs");

    await page.getByRole("button", { name: "New Job" }).click();

    await expect(page.getByLabel("Job Title")).toBeVisible();
    await expect(page.getByLabel("Job Description")).toBeVisible();

    const titleInput = page.getByLabel("Job Title");
    await expect(titleInput).toHaveAttribute("required", "");
    await expect(titleInput).toHaveAttribute("minlength", "3");

    const descInput = page.getByLabel("Job Description");
    await expect(descInput).toHaveAttribute("required", "");
    await expect(descInput).toHaveAttribute("minlength", "50");
  });

  test("generate interview link shows toast and copies link", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-write"]);
    await setupDashboardMocks(page);
    await page.goto("/dashboard/jobs");

    await page.getByRole("button", { name: /Text Interview Link/i }).click();
    const modal = page.getByRole("dialog");
    await modal.getByRole("button", { name: "Generate Link" }).click();

    await expect(
      page.getByText("Link generated and copied to clipboard")
    ).toBeVisible({ timeout: 5000 });
  });

  test("delete job shows confirmation dialog", async ({ page }) => {
    await page.goto("/dashboard/jobs");

    await page.getByRole("button", { name: "Delete job posting" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Delete job posting")).toBeVisible();
    await expect(
      page.getByText("Are you sure you want to delete this job posting?")
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });
});
