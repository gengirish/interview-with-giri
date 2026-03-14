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
  {
    session_id: "s3",
    candidate_name: "Carol Davis",
    candidate_email: "carol@example.com",
    overall_score: 3.5,
    duration_seconds: 900,
    completed_at: "2026-01-17T10:00:00Z",
    is_shortlisted: false,
    skill_scores: { Python: { score: 3.0, evidence: "Below average" } },
    behavioral_scores: { communication: { score: 4.0, evidence: "Poor" } },
    recommendation: "no_hire",
    confidence_score: 0.6,
    strengths: [],
    concerns: ["Lacks fundamentals"],
    ai_summary: "Not recommended.",
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

async function setupCompareMocks(page: import("@playwright/test").Page, options?: {
  candidates?: typeof MOCK_CANDIDATES;
  emptyCandidates?: boolean;
}) {
  const candidates = options?.emptyCandidates ? [] : (options?.candidates ?? MOCK_CANDIDATES);

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
        body: JSON.stringify(candidates),
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

test.describe("Candidate Comparison Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await setupCompareMocks(page);
    await setAuthState(page);
  });

  test("compare page renders with job selector", async ({ page }) => {
    await page.goto("/dashboard/compare");

    await expect(page.getByRole("heading", { name: "Candidate Comparison" })).toBeVisible();
    const jobLabel = page.locator("label").filter({ hasText: /^Job$/ });
    await expect(jobLabel).toBeVisible();
    await expect(page.getByRole("combobox")).toBeVisible();
    await expect(page.getByRole("combobox").filter({ hasText: "Senior Backend Engineer" })).toBeVisible();
  });

  test("selecting a job loads candidate comparison data", async ({ page }) => {
    await page.goto("/dashboard/compare");

    await expect(page.getByRole("heading", { name: "Candidate Comparison" })).toBeVisible();
    await expect(page.getByText("Alice Smith")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Bob Johnson")).toBeVisible();
    await expect(page.getByText("Carol Davis")).toBeVisible();
  });

  test("candidates are displayed in a sortable table", async ({ page }) => {
    await page.goto("/dashboard/compare");

    await expect(page.getByText("Alice Smith")).toBeVisible({ timeout: 5000 });
    const table = page.locator("table");
    await expect(table.getByRole("columnheader", { name: /Name/i }).first()).toBeVisible();
    await expect(table.getByRole("columnheader", { name: /Score/i }).first()).toBeVisible();
    await expect(table.getByRole("columnheader", { name: /Recommendation/i }).first()).toBeVisible();

    await table.getByRole("columnheader", { name: /Name/i }).first().click();
    await expect(page.getByText("Alice Smith")).toBeVisible();
  });

  test("shortlist toggle works and updates UI optimistically", async ({ page }) => {
    await page.goto("/dashboard/compare");

    await expect(page.getByText("Bob Johnson")).toBeVisible({ timeout: 5000 });
    const bobRow = page.locator("tr").filter({ hasText: "Bob Johnson" });
    const shortlistBtn = bobRow.getByRole("button", { name: "Add to shortlist" });
    await expect(shortlistBtn).toBeVisible();
    await shortlistBtn.click();

    await expect(bobRow.getByRole("button", { name: "Remove from shortlist" })).toBeVisible({
      timeout: 5000,
    });
  });

  test("show only shortlisted filter works", async ({ page }) => {
    await page.goto("/dashboard/compare");

    await expect(page.getByText("Alice Smith")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Bob Johnson")).toBeVisible();

    await page.getByLabel("Show only shortlisted").check();
    await expect(page.getByText("Alice Smith")).toBeVisible();
    await expect(page.getByText("Bob Johnson")).not.toBeVisible();
  });

  test("score colors are applied correctly (green/yellow/red)", async ({ page }) => {
    await page.goto("/dashboard/compare");

    await expect(page.getByText("Alice Smith")).toBeVisible({ timeout: 5000 });
    const aliceRow = page.locator("tbody tr").filter({ hasText: "Alice Smith" });
    await expect(aliceRow.locator("span.text-emerald-600")).toBeVisible();

    const bobRow = page.locator("tbody tr").filter({ hasText: "Bob Johnson" });
    await expect(bobRow.locator("span.text-amber-600")).toBeVisible();

    const carolRow = page.locator("tbody tr").filter({ hasText: "Carol Davis" });
    await expect(carolRow.locator("span.text-red-600")).toBeVisible();
  });

  test("export to CSV button is present", async ({ page }) => {
    await page.goto("/dashboard/compare");

    await expect(page.getByText("Alice Smith")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  });

  test("empty state shown when no completed interviews", async ({ page }) => {
    await setupCompareMocks(page, { emptyCandidates: true });
    await page.goto("/dashboard/compare");

    await expect(page.getByRole("heading", { name: "Candidate Comparison" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No completed interviews" })).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText("This job has no completed interviews yet. Run interviews and complete them to compare")
    ).toBeVisible();
  });
});
