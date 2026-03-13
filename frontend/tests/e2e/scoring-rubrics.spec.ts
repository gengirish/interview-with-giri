import { test, expect } from "@playwright/test";
import { setAuthState, setupDashboardMocks } from "./helpers";

test.describe("Custom Scoring Rubrics", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("scoring rubric section is visible in job creation form", async ({
    page,
  }) => {
    await page.goto("/dashboard/jobs");
    await page.getByRole("button", { name: "New Job" }).click();

    await expect(
      page.getByText("Custom Scoring Rubric (Optional)")
    ).toBeVisible();
    await expect(
      page.getByText("Leave empty to use default AI scoring rubric")
    ).toBeVisible();
  });

  test("add dimension button adds a new row", async ({ page }) => {
    await page.goto("/dashboard/jobs");
    await page.getByRole("button", { name: "New Job" }).click();

    await page.getByRole("button", { name: "+ Add Dimension" }).click();

    await expect(
      page.getByPlaceholder("Dimension name")
    ).toBeVisible();
  });

  test("dimension row has name, weight, and description fields", async ({
    page,
  }) => {
    await page.goto("/dashboard/jobs");
    await page.getByRole("button", { name: "New Job" }).click();
    await page.getByRole("button", { name: "+ Add Dimension" }).click();

    await expect(page.getByPlaceholder("Dimension name")).toBeVisible();
    await expect(page.getByText("Weight")).toBeVisible();
    await expect(page.getByPlaceholder("Description")).toBeVisible();
  });

  test("remove dimension button removes the row", async ({ page }) => {
    await page.goto("/dashboard/jobs");
    await page.getByRole("button", { name: "New Job" }).click();
    await page.getByRole("button", { name: "+ Add Dimension" }).click();

    await expect(page.getByPlaceholder("Dimension name")).toBeVisible();

    await page.getByRole("button", { name: "Remove dimension" }).click();

    await expect(page.getByPlaceholder("Dimension name")).not.toBeVisible();
  });

  test("quick-add buttons add pre-defined dimensions", async ({ page }) => {
    await page.goto("/dashboard/jobs");
    await page.getByRole("button", { name: "New Job" }).click();

    await page.getByRole("button", { name: "+ Code Quality" }).click();

    await expect(page.getByPlaceholder("Dimension name").first()).toHaveValue(
      "Code Quality"
    );
  });
});
