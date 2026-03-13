import { test, expect } from "@playwright/test";
import { API_PATTERN } from "./helpers";

const MOCK_PRACTICE_START = {
  token: "test-practice-token",
  interview_url: "http://localhost:3000/interview/test-practice-token",
  format: "text",
  role_type: "technical",
};

async function setupPracticeMocks(page: import("@playwright/test").Page) {
  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/practice/start") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PRACTICE_START),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
  });
}

test.describe("Practice Mode", () => {
  test.beforeEach(async ({ page }) => {
    await setupPracticeMocks(page);
  });

  test("practice page renders with hero section", async ({ page }) => {
    await page.goto("/practice");

    await expect(page.getByRole("heading", { name: "Practice Your Interview" })).toBeVisible();
    await expect(page.getByText("Free AI Interview Practice")).toBeVisible();
    await expect(page.getByText("Choose a role to practice")).toBeVisible();
  });

  test("shows all 6 practice templates", async ({ page }) => {
    await page.goto("/practice");

    await expect(page.getByRole("heading", { name: "Software Engineer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Product Manager" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Data Scientist" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Frontend Developer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Backend Developer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "DevOps Engineer" })).toBeVisible();
  });

  test("template cards show correct badges (Technical/Behavioral)", async ({ page }) => {
    await page.goto("/practice");

    await expect(page.getByText("Technical", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Behavioral", { exact: true }).first()).toBeVisible();
  });

  test("selecting a template shows the start form", async ({ page }) => {
    await page.goto("/practice");

    await page.getByRole("button", { name: /Software Engineer/ }).first().click();

    await expect(page.getByPlaceholder("Enter your name")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Start Practice Interview" })).toBeVisible();
    await expect(page.getByText("5 questions - ~15 minutes - With AI coaching tips")).toBeVisible();
  });

  test("start button triggers practice session", async ({ page }) => {
    await page.goto("/practice");

    await page.getByRole("button", { name: /Software Engineer/ }).first().click();
    await page.getByPlaceholder("Enter your name").fill("Test User");
    await page.getByRole("button", { name: "Start Practice Interview" }).click();

    await expect(page).toHaveURL(/\/interview\/test-practice-token/, { timeout: 5000 });
  });

  test("footer shows signup link", async ({ page }) => {
    await page.goto("/practice");

    await expect(page.getByRole("link", { name: "Create your free account" })).toBeVisible();
  });
});
