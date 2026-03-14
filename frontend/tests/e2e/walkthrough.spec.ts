import { test, expect } from "@playwright/test";
import { setAuthState, setupDashboardMocks } from "./helpers";

test.describe("Walkthrough / Onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("help button is visible on dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("help-button")).toBeVisible();
  });

  test("help button opens menu with tour options", async ({ page }) => {
    await page.goto("/dashboard");
    const helpButton = page.getByTestId("help-button");
    await expect(helpButton).toBeVisible();

    await helpButton.getByRole("button", { name: "Help and tours" }).click();
    await expect(page.getByText("Replay page tour")).toBeVisible();
    await expect(page.getByText("Reset all tours")).toBeVisible();
  });

  test("help button is hidden on candidate interview pages", async ({
    page,
  }) => {
    await page.route(/\/api\/v1\//, async (route) => {
      const url = route.request().url();
      if (url.includes("/public/")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            token: "test-token",
            status: "pending",
            format: "text",
            job_title: "Test Job",
            job_description: "Test description",
            interview_config: {
              num_questions: 5,
              duration_minutes: 20,
              difficulty: "medium",
            },
            branding: {},
            is_practice: false,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        });
      }
    });

    await page.goto("/interview/test-token-abc");
    await expect(page.getByTestId("help-button")).not.toBeVisible();
  });

  test("tour auto-starts on first dashboard visit", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem("walkthrough_progress");
    });
    await page.goto("/dashboard");

    await page.waitForTimeout(1500);
    const tooltip = page.locator(".react-joyride__tooltip, [data-test-id='joyride-tooltip']");
    const customTooltip = page.getByText("Your Hiring Metrics");
    const isVisible =
      (await tooltip.count()) > 0 || (await customTooltip.isVisible().catch(() => false));

    expect(isVisible).toBeTruthy();
  });
});
