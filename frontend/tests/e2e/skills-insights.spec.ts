import { test, expect } from "@playwright/test";
import {
  API_PATTERN,
  setAuthState,
  MOCK_ANALYTICS_OVERVIEW,
  MOCK_JOBS,
} from "./helpers";

const MOCK_SKILLS_INSIGHTS = {
  total_candidates: 25,
  skill_averages: {
    Python: { avg: 7.8, min: 4.0, max: 9.5, count: 25, std_dev: 1.2 },
    "System Design": {
      avg: 4.2,
      min: 2.0,
      max: 7.0,
      count: 20,
      std_dev: 1.5,
    },
    React: { avg: 8.1, min: 6.0, max: 10.0, count: 15, std_dev: 0.9 },
    Docker: { avg: 3.5, min: 1.0, max: 6.0, count: 10, std_dev: 1.8 },
  },
  behavioral_averages: {
    communication: { avg: 7.5, count: 25 },
    problem_solving: { avg: 6.8, count: 25 },
  },
  skill_gaps: [
    { skill: "Docker", avg: 3.5, count: 10 },
    { skill: "System Design", avg: 4.2, count: 20 },
  ],
  skill_strengths: [
    { skill: "React", avg: 8.1, count: 15 },
    { skill: "Python", avg: 7.8, count: 25 },
  ],
  recommendations: [
    "Consider adding Docker fundamentals to your screening criteria.",
    "System Design scores are consistently low - adjust JD to set clearer expectations.",
    "Your Python candidate pool is strong - maintain current sourcing strategy.",
  ],
};

const MOCK_SATISFACTION = {
  total_responses: 30,
  avg_overall: 4.2,
  avg_fairness: 4.0,
  avg_clarity: 4.5,
  avg_relevance: 3.8,
  nps_score: 65.0,
  rating_distribution: { "1": 1, "2": 2, "3": 5, "4": 10, "5": 12 },
  recent_comments: [
    {
      comment: "Great interview experience!",
      rating: 5,
      created_at: "2026-01-15T10:00:00Z",
    },
    {
      comment: "Questions were very relevant.",
      rating: 4,
      created_at: "2026-01-14T10:00:00Z",
    },
  ],
};

const MOCK_ANALYTICS_PER_JOB_WITH_JOBS = [
  {
    job_id: "job-1",
    title: "Senior Backend Engineer",
    total: 25,
    completed: 22,
    avg_score: 7.5,
    avg_duration_minutes: 28,
  },
];

async function setupSkillsInsightsMocks(page: import("@playwright/test").Page) {
  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/analytics/overview")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_ANALYTICS_OVERVIEW),
      });
    } else if (url.includes("/analytics/per-job")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_ANALYTICS_PER_JOB_WITH_JOBS),
      });
    } else if (url.includes("/analytics/skills-insights")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SKILLS_INSIGHTS),
      });
    } else if (url.includes("/analytics/candidate-satisfaction")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SATISFACTION),
      });
    } else if (url.includes("/job-postings") && !url.includes("/extract-skills")) {
      if (method === "GET" && !url.match(/\/job-postings\/[^/]+$/)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: MOCK_JOBS,
            total: MOCK_JOBS.length,
            page: 1,
            per_page: 10,
          }),
        });
      } else {
        await route.continue();
      }
    } else if (url.includes("/dashboard/stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not mocked" }),
      });
    }
  });
}

test.describe("Skills Insights", () => {
  test.beforeEach(async ({ page }) => {
    await setupSkillsInsightsMocks(page);
    await setAuthState(page);
  });

  test("Skills Insights section is visible on analytics page", async ({
    page,
  }) => {
    await page.goto("/dashboard/analytics");

    await expect(page.getByRole("heading", { name: "Skills Insights" })).toBeVisible({
      timeout: 15000,
    });
  });

  test("skill heatmap shows all skills with color coding", async ({ page }) => {
    await page.goto("/dashboard/analytics");

    await expect(page.getByText("Skill Heatmap")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Python", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("System Design", { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText("React", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Docker", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("7.8/10").first()).toBeVisible();
    await expect(page.getByText("4.2/10").first()).toBeVisible();
    await expect(page.getByText("8.1/10").first()).toBeVisible();
    await expect(page.getByText("3.5/10").first()).toBeVisible();
  });

  test("skills gaps are highlighted", async ({ page }) => {
    await page.goto("/dashboard/analytics");

    await expect(page.getByText("Skills Gaps")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Docker (n=10)")).toBeVisible();
    await expect(page.getByText("System Design (n=20)")).toBeVisible();
  });

  test("skills strengths are highlighted", async ({ page }) => {
    await page.goto("/dashboard/analytics");

    await expect(page.getByText("Skills Strengths")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("React (n=15)")).toBeVisible();
    await expect(page.getByText("Python (n=25)")).toBeVisible();
  });

  test("AI recommendations are displayed", async ({ page }) => {
    await page.goto("/dashboard/analytics");

    await expect(page.getByText("AI Recommendations")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText(
        "Consider adding Docker fundamentals to your screening criteria."
      )
    ).toBeVisible();
    await expect(
      page.getByText(
        "System Design scores are consistently low - adjust JD to set clearer expectations."
      )
    ).toBeVisible();
    await expect(
      page.getByText(
        "Your Python candidate pool is strong - maintain current sourcing strategy."
      )
    ).toBeVisible();
  });

  test("Candidate Experience section shows NPS score", async ({ page }) => {
    await page.goto("/dashboard/analytics");

    await expect(page.getByText("Candidate Experience")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("NPS Score")).toBeVisible();
    await expect(page.getByText("65.0")).toBeVisible();
  });

  test("candidate satisfaction shows rating distribution", async ({
    page,
  }) => {
    await page.goto("/dashboard/analytics");

    await expect(page.getByText("Rating Distribution")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("12", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("10", { exact: true }).first()).toBeVisible();
  });
});
