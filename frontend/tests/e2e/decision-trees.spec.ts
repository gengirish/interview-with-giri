import { test, expect } from "@playwright/test";
import { setAuthState, setupDashboardMocks } from "./helpers";

const MOCK_TREES = [
  {
    id: "tree-1",
    name: "Technical Interview Flow",
    description: "For technical roles",
    role_type: "technical",
    tree_data: { nodes: [] },
    is_published: true,
    usage_count: 5,
    created_at: "2024-01-15T10:00:00Z",
  },
  {
    id: "tree-2",
    name: "Behavioral Flow",
    description: "Behavioral questions",
    role_type: "non_technical",
    tree_data: { nodes: [] },
    is_published: false,
    usage_count: 0,
    created_at: "2024-01-16T10:00:00Z",
  },
];

test.describe("Decision Trees", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page, { decisionTrees: MOCK_TREES });
    await setAuthState(page);
  });

  test("decision trees list page renders", async ({ page }) => {
    await page.goto("/dashboard/decision-trees");

    await expect(
      page.getByRole("heading", { name: "Decision Trees" })
    ).toBeVisible();
    await expect(
      page.getByText("Design non-linear interview flows with branching")
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Create New" })).toBeVisible();
  });

  test("create tree form appears", async ({ page }) => {
    await setupDashboardMocks(page, { decisionTrees: [] });
    await setAuthState(page);
    await page.goto("/dashboard/decision-trees");
    await page.getByRole("button", { name: "Create New" }).click();

    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Role Type")).toBeVisible();
    await expect(page.getByLabel("Description")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible();
  });

  test("tree editor page renders", async ({ page }) => {
    await page.route(/\/api\/v1\/decision-trees\/tree-1/, async (route) => {
      const url = route.request().url();
      if (url.includes("tree-1") && route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_TREES[0]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/decision-trees/tree-1");

    await expect(page.getByRole("heading", { name: "Technical Interview Flow" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Validate" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("validate button calls validate endpoint", async ({ page }) => {
    let validateCalled = false;
    await page.route(/\/api\/v1\/decision-trees/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("tree-1") && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_TREES[0]),
        });
      } else if (url.includes("/validate") && method === "POST") {
        validateCalled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ valid: true, errors: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/decision-trees/tree-1");
    await page.getByRole("button", { name: "Validate" }).click();

    await expect(async () => {
      expect(validateCalled).toBe(true);
    }).toPass({ timeout: 3000 });
  });

  test("publish toggle visible", async ({ page }) => {
    await page.route(/\/api\/v1\/decision-trees\/tree-1/, async (route) => {
      const url = route.request().url();
      if (url.includes("tree-1") && route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_TREES[0]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/decision-trees/tree-1");

    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  });

  test("node cards display in editor", async ({ page }) => {
    const treeWithNodes = {
      ...MOCK_TREES[0],
      tree_data: {
        nodes: [
          { id: "entry", type: "entry", next: "q1", branches: [] },
          { id: "q1", type: "question_block", config: { topic: "Python" }, next: "exit", branches: [] },
          { id: "exit", type: "exit", branches: [] },
        ],
      },
    };
    await page.route(/\/api\/v1\/decision-trees\/tree-1/, async (route) => {
      const url = route.request().url();
      if (url.includes("tree-1") && route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(treeWithNodes),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/decision-trees/tree-1");

    await expect(page.getByText("Entry")).toBeVisible();
    await expect(page.getByText("Exit")).toBeVisible();
  });

  test("navigation item exists for admin", async ({ page }) => {
    await page.goto("/dashboard/jobs");
    await expect(page.getByRole("link", { name: "Decision Trees" })).toBeVisible();
  });
});
