import { test, expect } from "@playwright/test";
import { API_PATTERN, setAuthState } from "./helpers";

const MOCK_CANDIDATES = [
  {
    session_id: "s1",
    candidate_name: "Alice Smith",
    candidate_email: "alice@example.com",
    overall_score: 9.0,
    duration_seconds: 1500,
    completed_at: "2026-01-15T10:00:00Z",
    is_shortlisted: true,
    skill_scores: { Python: { score: 9.5, evidence: "Excellent" } },
    behavioral_scores: { communication: { score: 8.5, evidence: "Clear" } },
    recommendation: "strong_hire",
    confidence_score: 0.92,
    strengths: ["Strong Python"],
    concerns: [],
    ai_summary: "Excellent candidate.",
  },
  {
    session_id: "s2",
    candidate_name: "Bob Johnson",
    candidate_email: "bob@example.com",
    overall_score: 6.5,
    duration_seconds: 1200,
    completed_at: "2026-01-16T10:00:00Z",
    is_shortlisted: false,
    skill_scores: { Python: { score: 6.0, evidence: "Average" } },
    behavioral_scores: { communication: { score: 7.0, evidence: "OK" } },
    recommendation: "hire",
    confidence_score: 0.75,
    strengths: ["Good problem solving"],
    concerns: ["Needs more experience"],
    ai_summary: "Average candidate.",
  },
];

const MOCK_JOBS_FOR_COMPARE = {
  items: [
    {
      id: "job-1",
      org_id: "org-123",
      title: "Senior Backend Engineer",
      role_type: "technical",
      job_description: "Looking for a senior backend engineer.",
      required_skills: ["Python"],
      interview_format: "text",
      interview_config: {},
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
  total: 1,
  page: 1,
  per_page: 20,
};

const MOCK_DEBRIEF_RESPONSE = {
  debrief: "# Hiring Debrief\n\n## Executive Summary\n\nAlice Smith and Bob Johnson were evaluated. Alice is the top candidate.",
  candidates: [{ name: "Alice Smith", score: 9.0 }, { name: "Bob Johnson", score: 6.5 }],
};

async function setupDebriefMocks(page: import("@playwright/test").Page) {
  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/job-postings") && !url.includes("/extract-skills") && !url.includes("/generate-link")) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_JOBS_FOR_COMPARE),
        });
      } else {
        await route.continue();
      }
    } else if (url.includes("/analytics/compare")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CANDIDATES),
      });
    } else if (url.includes("/reports/debrief") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DEBRIEF_RESPONSE),
      });
    } else if (url.includes("/interviews/") && url.includes("/shortlist") && method === "PATCH") {
      const sessionId = url.match(/\/interviews\/([^/]+)\/shortlist/)?.[1];
      const body = route.request().postDataJSON?.() ?? {};
      const isShortlisted = body.is_shortlisted ?? true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session_id: sessionId, is_shortlisted: isShortlisted }),
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

test.describe("AI Debrief", () => {
  test.beforeEach(async ({ page }) => {
    await setupDebriefMocks(page);
    await setAuthState(page);
  });

  test("Generate AI Debrief button is visible on compare page", async ({ page }) => {
    await page.goto("/dashboard/compare");

    await expect(page.getByText("Alice Smith")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Generate AI Debrief" })).toBeVisible();
  });

  test("clicking debrief button triggers API call and shows modal", async ({ page }) => {
    await page.goto("/dashboard/compare");

    await expect(page.getByText("Alice Smith")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Generate AI Debrief" }).click();

    await expect(page.getByRole("heading", { name: "AI Hiring Debrief" })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Executive Summary")).toBeVisible();
    await expect(page.getByText("Alice Smith and Bob Johnson were evaluated")).toBeVisible();
  });

  test("debrief modal has close and download buttons", async ({ page }) => {
    await page.goto("/dashboard/compare");

    await expect(page.getByText("Alice Smith")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Generate AI Debrief" }).click();

    await expect(page.getByRole("heading", { name: "AI Hiring Debrief" })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
  });
});
