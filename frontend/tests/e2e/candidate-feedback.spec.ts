import { test, expect } from "@playwright/test";
import { API_PATTERN } from "./helpers";

const MOCK_COMPLETED_INTERVIEW = {
  status: "completed",
  format: "text",
  job_title: "Senior Backend Engineer",
  job_description: "Looking for a senior backend engineer.",
  interview_config: { num_questions: 10, duration_minutes: 30 },
  is_practice: false,
};

const MOCK_FEEDBACK_RESPONSE = {
  id: "fb-1",
  message: "Thank you!",
};

async function setupFeedbackMocks(page: import("@playwright/test").Page) {
  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/interviews/public/") && !url.includes("/feedback") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_COMPLETED_INTERVIEW),
      });
    } else if (url.includes("/feedback") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_FEEDBACK_RESPONSE),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
  });
}

test.describe("Candidate Feedback (NPS)", () => {
  test.beforeEach(async ({ page }) => {
    await setupFeedbackMocks(page);
  });

  test("completed interview shows feedback form", async ({ page }) => {
    await page.goto("/interview/test-token-123");

    await expect(page.getByRole("heading", { name: "Interview Complete" })).toBeVisible();
    await expect(page.getByText("How was your experience?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit Feedback" })).toBeVisible();
  });

  test("star rating is interactive", async ({ page }) => {
    await page.goto("/interview/test-token-123");

    const submitBtn = page.getByRole("button", { name: "Submit Feedback" });
    await expect(submitBtn).toBeDisabled();

    await page.getByRole("button", { name: "5 stars" }).first().click();

    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await expect(page.locator("svg.fill-amber-400").first()).toBeVisible();
  });

  test("submit feedback with rating", async ({ page }) => {
    await page.goto("/interview/test-token-123");

    await page.getByRole("button", { name: "4 stars" }).first().click();
    await page.getByRole("button", { name: "Submit Feedback" }).click();

    await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByText("Your feedback has been recorded. We appreciate you taking the time")
    ).toBeVisible();
  });

  test("feedback form has all category ratings", async ({ page }) => {
    await page.goto("/interview/test-token-123");

    await expect(page.getByText("Fairness")).toBeVisible();
    await expect(page.getByText("Clarity")).toBeVisible();
    await expect(page.getByText("Relevance")).toBeVisible();
    await expect(page.getByPlaceholder("Any additional feedback?")).toBeVisible();
  });
});
