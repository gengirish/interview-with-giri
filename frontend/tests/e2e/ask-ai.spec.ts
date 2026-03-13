import { test, expect } from "@playwright/test";
import { API_PATTERN, setAuthState, MOCK_JOBS } from "./helpers";

const MOCK_AI_RESPONSE = {
  answer: "Based on the interviews, Alice scored highest on problem solving with 9.5/10.",
  citations: [
    {
      session_id: "sess-1",
      candidate_name: "Alice Smith",
      content_snippet: "Excellent problem-solving demonstrated in system design.",
      source_type: "report",
    },
  ],
  sessions_searched: 15,
};

async function setupAskAIMocks(page: import("@playwright/test").Page) {
  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/job-postings")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: MOCK_JOBS, total: 1, page: 1, per_page: 10 }),
      });
    } else if (url.includes("/ai/ask") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_AI_RESPONSE),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
  });
}

test.describe("Ask AI", () => {
  test.beforeEach(async ({ page }) => {
    await setupAskAIMocks(page);
    await setAuthState(page);
  });

  test("Ask AI page renders with header and input", async ({ page }) => {
    await page.goto("/dashboard/ask-ai");

    await expect(page.locator("main").getByRole("heading", { name: "Ask AI" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Search across all your interview data")).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder("Ask about your interviews...")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 5000 });
  });

  test("empty state shows guidance text", async ({ page }) => {
    await page.goto("/dashboard/ask-ai");

    await expect(page.getByText("Ask questions about your interviews")).toBeVisible();
  });

  test("user can type and submit a question", async ({ page }) => {
    await page.goto("/dashboard/ask-ai");

    const input = page.getByPlaceholder("Ask about your interviews...");
    await input.fill("Who scored highest on problem solving?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Who scored highest on problem solving?")).toBeVisible({
      timeout: 5000,
    });
  });

  test("AI response with citations is displayed", async ({ page }) => {
    await page.goto("/dashboard/ask-ai");

    const input = page.getByPlaceholder("Ask about your interviews...");
    await input.fill("Who scored highest?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText(MOCK_AI_RESPONSE.answer)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Alice Smith")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Excellent problem-solving demonstrated in system design.")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Searched 15 interviews")).toBeVisible({ timeout: 5000 });
  });

  test("job filter dropdown works", async ({ page }) => {
    await page.goto("/dashboard/ask-ai");

    await expect(page.getByRole("button", { name: "All jobs" })).toBeVisible();
    await page.getByRole("button", { name: "All jobs" }).click();

    await expect(page.getByText("Senior Backend Engineer")).toBeVisible({ timeout: 5000 });
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    await page.goto("/dashboard/ask-ai");

    const sendBtn = page.getByRole("button", { name: "Send" });
    await expect(sendBtn).toBeDisabled();
  });
});
