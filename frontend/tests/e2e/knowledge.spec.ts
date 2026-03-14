import { test, expect } from "@playwright/test";
import {
  setAuthState,
  setupDashboardMocks,
  API_PATTERN,
} from "./helpers";

const MOCK_ENTRIES = {
  items: [
    {
      id: "entry-1",
      category: "question_insight",
      title: "System Design Questions Work Best",
      content:
        "Candidates who scored above 8 on system design questions had a 78% hire rate. Consider prioritizing system design in technical interviews.",
      source_data: { role_type: "technical", interview_count: 25 },
      confidence: 0.85,
      tags: ["system_design", "prediction"],
      created_at: "2026-01-15T10:00:00Z",
    },
    {
      id: "entry-2",
      category: "role_pattern",
      title: "React Roles Show Strong Communication",
      content:
        "For React/frontend roles, candidates with high communication scores tended to perform better in pair programming scenarios.",
      source_data: { role_type: "technical", interview_count: 15 },
      confidence: 0.72,
      tags: ["react", "communication"],
      created_at: "2026-01-14T09:00:00Z",
    },
  ],
  total: 2,
};

const MOCK_QUERY_RESPONSE = {
  answer:
    "Your pass rate for React roles is 72%. System design questions correlate strongly with hire success. Consider adding more system design questions to your technical interviews.",
  sources: [
    { id: "entry-1", title: "System Design Questions Work Best", category: "question_insight" },
  ],
  query_id: "query-log-1",
};

const MOCK_SUGGESTIONS = {
  suggestions: [
    {
      title: "Pass rate dropped 15% for React roles",
      detail: "Consider revisiting question difficulty or expanding the candidate pool",
      type: "warning",
    },
    {
      title: "Strong performance in system design",
      detail: "Candidates excel in system design; consider deepening this dimension",
      type: "success",
    },
  ],
};

const MOCK_POPULAR_QUERIES = {
  queries: [
    { query: "What questions work best for senior engineers?", count: 12 },
    { query: "What's our pass rate for React roles?", count: 8 },
  ],
};

async function setupKnowledgeMocks(
  page: import("@playwright/test").Page,
  options?: {
    entries?: typeof MOCK_ENTRIES;
    emptyEntries?: boolean;
    suggestions?: typeof MOCK_SUGGESTIONS;
    popularQueries?: typeof MOCK_POPULAR_QUERIES;
  }
) {
  const entries = options?.emptyEntries
    ? { items: [], total: 0 }
    : options?.entries ?? MOCK_ENTRIES;
  const suggestions = options?.suggestions ?? MOCK_SUGGESTIONS;
  const popularQueries = options?.popularQueries ?? MOCK_POPULAR_QUERIES;

  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/knowledge/entries") && !url.match(/\/entries\/[^/]+$/)) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(entries),
        });
      } else {
        await route.continue();
      }
    } else if (url.match(/\/knowledge\/entries\/[^/]+$/) && method === "GET") {
      const id = url.split("/entries/")[1]?.split("?")[0];
      const entry = entries.items.find((e: { id: string }) => e.id === id);
      if (entry) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(entry),
        });
      } else {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      }
    } else if (url.includes("/knowledge/query") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_QUERY_RESPONSE),
      });
    } else if (url.includes("/knowledge/generate") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", entries_created: 5 }),
      });
    } else if (url.includes("/knowledge/suggestions") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(suggestions),
      });
    } else if (url.includes("/knowledge/query/") && url.includes("/rate") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", rating: 5 }),
      });
    } else if (url.includes("/knowledge/popular-queries") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(popularQueries),
      });
    } else {
      await route.continue();
    }
  });
}

test.describe("Knowledge", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("knowledge page renders", async ({ page }) => {
    await setupKnowledgeMocks(page);
    await page.goto("/dashboard/knowledge");

    await expect(
      page.getByRole("heading", { name: "Hiring Knowledge Base" })
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("Ask anything about your hiring data...")
    ).toBeVisible();
  });

  test("query input and submit", async ({ page }) => {
    await setupKnowledgeMocks(page);
    await page.goto("/dashboard/knowledge");

    await page
      .getByPlaceholder("Ask anything about your hiring data...")
      .fill("What questions work best for senior engineers?");
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.getByText("pass rate")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("System Design Questions Work Best")).toBeVisible();
  });

  test("response display with sources", async ({ page }) => {
    await setupKnowledgeMocks(page);
    await page.goto("/dashboard/knowledge");

    await page
      .getByPlaceholder("Ask anything about your hiring data...")
      .fill("React pass rate");
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.getByText("72%")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("System Design Questions Work Best")).toBeVisible();
  });

  test("suggested insights section", async ({ page }) => {
    await setupKnowledgeMocks(page);
    await page.goto("/dashboard/knowledge");

    await page.getByRole("button", { name: "Generate Insights" }).click();

    await expect(page.getByText("Pass rate dropped 15%")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Strong performance in system design")).toBeVisible();
  });

  test("knowledge browser with entry cards", async ({ page }) => {
    await setupKnowledgeMocks(page);
    await page.goto("/dashboard/knowledge");

    await expect(page.getByText("Knowledge Browser")).toBeVisible();
    await expect(page.getByText("System Design Questions Work Best")).toBeVisible();
    await expect(page.getByText("React Roles Show Strong Communication")).toBeVisible();
    await expect(page.getByText("85% confidence")).toBeVisible();
  });

  test("entry cards show category and tags", async ({ page }) => {
    await setupKnowledgeMocks(page);
    await page.goto("/dashboard/knowledge");

    await expect(page.getByText("Question Insight")).toBeVisible();
    await expect(page.getByText("system_design")).toBeVisible();
  });

  test("popular queries sidebar", async ({ page }) => {
    await setupKnowledgeMocks(page);
    await page.goto("/dashboard/knowledge");

    await expect(page.getByText("Popular Queries")).toBeVisible();
    await expect(
      page.getByText("What questions work best for senior engineers?")
    ).toBeVisible();
  });

  test("popular query click fills input", async ({ page }) => {
    await setupKnowledgeMocks(page);
    await page.goto("/dashboard/knowledge");

    await page
      .getByText("What questions work best for senior engineers?")
      .first()
      .click();

    await expect(
      page.getByPlaceholder("Ask anything about your hiring data...")
    ).toHaveValue("What questions work best for senior engineers?");
  });

  test("rating buttons on query response", async ({ page }) => {
    await setupKnowledgeMocks(page);
    await page.goto("/dashboard/knowledge");

    await page
      .getByPlaceholder("Ask anything about your hiring data...")
      .fill("test query");
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.getByTitle("Helpful")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTitle("Not helpful")).toBeVisible();
  });

  test("navigation sidebar has Knowledge link", async ({ page }) => {
    await setupKnowledgeMocks(page);
    await page.goto("/dashboard");

    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar.getByRole("link", { name: "Knowledge" })).toBeVisible();
  });

  test("empty state when no entries", async ({ page }) => {
    await setupKnowledgeMocks(page, { emptyEntries: true });
    await page.goto("/dashboard/knowledge");

    await expect(
      page.getByText("No knowledge entries yet")
    ).toBeVisible();
  });

  test("category filter dropdown", async ({ page }) => {
    await setupKnowledgeMocks(page);
    await page.goto("/dashboard/knowledge");

    await expect(page.getByRole("combobox", { name: "" })).toBeVisible();
    await page.getByRole("combobox").selectOption("question_insight");
  });

  test("Mine Knowledge button", async ({ page }) => {
    await setupKnowledgeMocks(page);
    await page.goto("/dashboard/knowledge");

    await page.getByRole("button", { name: "Mine Knowledge" }).click();

    await expect(page.getByText("Created 5 knowledge entries")).toBeVisible({
      timeout: 5000,
    });
  });
});
