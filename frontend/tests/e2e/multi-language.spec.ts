import { test, expect } from "@playwright/test";
import { setAuthState, setupDashboardMocks } from "./helpers";

test.describe("Multi-Language Interview Support", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("job creation form shows language selector with default English", async ({
    page,
  }) => {
    await page.goto("/dashboard/jobs");
    await page.getByRole("button", { name: "New Job" }).click();

    const languageSelect = page.getByLabel("Language");
    await expect(languageSelect).toBeVisible();
    await expect(languageSelect).toHaveValue("en");
  });

  test("language selector has multiple language options", async ({ page }) => {
    await page.goto("/dashboard/jobs");
    await page.getByRole("button", { name: "New Job" }).click();

    const languageSelect = page.getByLabel("Language");
    await expect(languageSelect).toBeVisible();
    await languageSelect.selectOption("es");
    await expect(languageSelect).toHaveValue("es");
    await languageSelect.selectOption("fr");
    await expect(languageSelect).toHaveValue("fr");
  });

  test("selecting a language includes it in the created job config", async ({
    page,
  }) => {
    let postBody: Record<string, unknown> | null = null;
    await setupDashboardMocks(page);
    await page.route(/\/api\/v1\//, async (route) => {
      const request = route.request();
      const url = request.url();
      if (
        url.includes("/job-postings") &&
        request.method() === "POST" &&
        !url.match(/\/job-postings\/[^/]+\//)
      ) {
        postBody = JSON.parse(request.postData() || "{}");
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "job-new",
            title: "Test Job",
            interview_config: { language: "es" },
          }),
        });
      } else {
        await route.continue();
      }
    });
    await setAuthState(page);
    await page.goto("/dashboard/jobs");
    await page.getByRole("button", { name: "New Job" }).click();

    await page.getByLabel("Job Title").fill("Test Job Title");
    await page
      .getByLabel("Job Description")
      .fill(
        "This is a test job description that exceeds fifty characters for validation."
      );
    await page.getByLabel("Language").selectOption("es");

    await page.getByRole("button", { name: "Create Job" }).click();

    await expect(async () => {
      expect(postBody).not.toBeNull();
      expect(postBody?.interview_config).toBeDefined();
      const config = postBody?.interview_config as Record<string, unknown>;
      expect(config?.language).toBe("es");
    }).toPass({ timeout: 5000 });
  });

  test("job edit form loads existing language from job data", async ({
    page,
  }) => {
    const jobWithSpanish = {
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
        language: "es",
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
          body: JSON.stringify(jobWithSpanish),
        });
      } else if (url.includes("/job-postings")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [jobWithSpanish],
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

    const languageSelect = page.getByLabel("Language");
    await expect(languageSelect).toBeVisible({ timeout: 10000 });
    await expect(languageSelect).toHaveValue("es");
  });
});
