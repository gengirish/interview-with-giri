import { test, expect } from "@playwright/test";
import { setAuthState, setupDashboardMocks } from "./helpers";

const MOCK_TEMPLATES = [
  {
    id: "tmpl-1",
    name: "Senior React Developer",
    description: "Full-stack React interview",
    role_type: "technical",
    job_description_template: "We are looking for a Senior React Developer...",
    required_skills: ["React", "TypeScript"],
    interview_config: {
      num_questions: 10,
      duration_minutes: 45,
      difficulty: "hard",
      include_coding: true,
      language: "en",
    },
    interview_format: "text",
    is_system: true,
  },
  {
    id: "tmpl-2",
    name: "Product Manager",
    description: "PM behavioral interview",
    role_type: "non_technical",
    job_description_template: "We are hiring a Product Manager...",
    required_skills: ["Product Strategy"],
    interview_config: {
      num_questions: 8,
      duration_minutes: 30,
      difficulty: "medium",
      include_coding: false,
      language: "en",
    },
    interview_format: "voice",
    is_system: true,
  },
];

test.describe("Interview Templates", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("use template button is visible in job creation form", async ({
    page,
  }) => {
    await page.goto("/dashboard/jobs");
    await page.getByRole("button", { name: "New Job" }).click();

    await expect(
      page.getByRole("button", { name: "Use Template" })
    ).toBeVisible();
  });

  test("clicking use template loads and shows template list", async ({
    page,
  }) => {
    await page.route(/\/api\/v1\//, async (route) => {
      const url = route.request().url();
      if (url.includes("/templates") && !url.includes("/from-job")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_TEMPLATES),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/jobs");
    await page.getByRole("button", { name: "New Job" }).click();
    await page.getByRole("button", { name: "Use Template" }).click();

    await expect(page.getByText("Choose a template")).toBeVisible();
    await expect(page.getByText("Senior React Developer")).toBeVisible();
    await expect(page.getByText("Product Manager")).toBeVisible();
  });

  test("selecting a template pre-fills the form fields", async ({ page }) => {
    await page.route(/\/api\/v1\//, async (route) => {
      const url = route.request().url();
      if (url.includes("/templates") && !url.includes("/from-job")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_TEMPLATES),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/jobs");
    await page.getByRole("button", { name: "New Job" }).click();
    await page.getByRole("button", { name: "Use Template" }).click();

    await page
      .getByRole("button", { name: /Senior React Developer/ })
      .click();

    await expect(page.getByLabel("Job Title")).toHaveValue(
      "Senior React Developer"
    );
    await expect(page.getByLabel("Job Description")).toContainText(
      "We are looking for a Senior React Developer"
    );
  });

  test("save as template button is visible on job edit page", async ({
    page,
  }) => {
    const mockJob = {
      id: "job-1",
      org_id: "org-123",
      title: "Senior Engineer",
      role_type: "technical",
      job_description: "Looking for a senior engineer.",
      required_skills: ["Python"],
      interview_format: "text",
      interview_config: {
        num_questions: 10,
        duration_minutes: 30,
        difficulty: "medium",
        include_coding: false,
        language: "en",
      },
      scoring_rubric: [],
      is_active: true,
      created_at: "2024-01-15T10:00:00Z",
    };

    await page.route(/\/api\/v1\//, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/dashboard/stats")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            total_interviews: 42,
            completed_interviews: 38,
            active_jobs: 5,
            avg_score: 78.5,
            interviews_this_month: 12,
            pass_rate: 85,
          }),
        });
      } else if (url.includes("/generate-link") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            token: "test-token",
            interview_url: "http://localhost:3000/interview/test-token",
          }),
        });
      } else if (url.match(/\/job-postings\/job-1$/)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockJob),
        });
      } else if (url.includes("/job-postings")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [mockJob],
            total: 1,
            page: 1,
            per_page: 10,
          }),
        });
      } else if (url.includes("/interviews") && !url.includes("/public/")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], total: 0, page: 1, per_page: 10 }),
        });
      } else if (url.includes("/analytics/")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
      } else if (url.includes("/users") && !url.includes("/me")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Not mocked" }),
        });
      }
    });

    await setAuthState(page);
    await page.goto("/dashboard/jobs/job-1");

    await expect(
      page.getByRole("button", { name: "Save as Template" })
    ).toBeVisible({ timeout: 10000 });
  });
});
