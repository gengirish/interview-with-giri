import { test, expect } from "@playwright/test";
import { API_PATTERN, MOCK_PUBLIC_INTERVIEW } from "./helpers";

test.describe("Interview flow (candidate)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/interviews/public/") && route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PUBLIC_INTERVIEW),
        });
      } else if (url.includes("/start") && route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "started" }),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Not mocked" }),
        });
      }
    });
  });

  test("consent form renders for candidate", async ({ page }) => {
    await page.goto("/interview/test-token-123");

    await expect(page.getByText("InterviewBot")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: MOCK_PUBLIC_INTERVIEW.job_title })
    ).toBeVisible();
    await expect(
      page.getByText(MOCK_PUBLIC_INTERVIEW.job_description)
    ).toBeVisible();
    await expect(page.getByPlaceholder("Jane Smith")).toBeVisible();
    await expect(page.getByPlaceholder("jane@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: /I Agree.*Continue/i })).toBeVisible();
  });

  test("consent form validates name and email required", async ({ page }) => {
    await page.goto("/interview/test-token-123");

    const nameInput = page.getByPlaceholder("Jane Smith");
    const emailInput = page.getByPlaceholder("jane@example.com");
    await expect(nameInput).toHaveAttribute("required", "");
    await expect(emailInput).toHaveAttribute("required", "");
  });

  test("completed interview shows completion screen", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/interviews/public/") && route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...MOCK_PUBLIC_INTERVIEW, status: "completed" }),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Not mocked" }),
        });
      }
    });

    await page.goto("/interview/test-token-123");

    await expect(page.getByRole("heading", { name: "Interview Complete" })).toBeVisible();
    await expect(
      page.getByText("Thank you for completing the interview!")
    ).toBeVisible();
  });
});
