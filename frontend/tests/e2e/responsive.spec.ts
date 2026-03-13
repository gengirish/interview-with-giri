import { test, expect } from "@playwright/test";
import { setAuthState, setupDashboardMocks } from "./helpers";

test.describe("Responsive", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("mobile viewport shows hamburger/menu button on dashboard", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");

    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(page.locator("[data-testid='sidebar']")).not.toBeVisible();
  });

  test("desktop viewport shows sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/dashboard");

    await expect(page.locator("[data-testid='sidebar']")).toBeVisible();
  });
});
