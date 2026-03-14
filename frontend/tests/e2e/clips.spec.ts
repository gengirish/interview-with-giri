import { test, expect } from "@playwright/test";
import { API_PATTERN, setAuthState, setupDashboardMocks } from "./helpers";

const MOCK_CLIPS = [
  {
    id: "clip-1",
    session_id: "sess-1",
    clip_type: "best_answer",
    title: "Exceptional System Design Answer",
    description: "Candidate demonstrated deep understanding.",
    message_start_index: 2,
    message_end_index: 3,
    transcript_excerpt: "Candidate: I would use a microservices architecture...",
    importance_score: 0.95,
    tags: [],
    share_token: null,
    created_at: "2026-01-15T11:00:00Z",
  },
  {
    id: "clip-2",
    session_id: "sess-1",
    clip_type: "red_flag",
    title: "Concerning response on testing",
    description: "Candidate showed weak testing knowledge.",
    message_start_index: 4,
    message_end_index: 5,
    transcript_excerpt: "Candidate: I usually skip unit tests...",
    importance_score: 0.7,
    tags: [],
    share_token: null,
    created_at: "2026-01-15T11:01:00Z",
  },
];

const MOCK_SESSION = {
  id: "sess-1",
  job_posting_id: "job-1",
  token: "test-token",
  candidate_name: "Alice Smith",
  candidate_email: "alice@example.com",
  status: "completed",
  format: "text",
  overall_score: 8.5,
  duration_seconds: 1800,
  started_at: "2026-01-15T10:00:00Z",
  completed_at: "2026-01-15T10:30:00Z",
  created_at: "2026-01-15T09:50:00Z",
};

const MOCK_REPORT = {
  id: "report-1",
  session_id: "sess-1",
  candidate_name: "Alice Smith",
  overall_score: 8.5,
  skill_scores: {},
  behavioral_scores: {},
  ai_summary: "Good",
  strengths: [],
  concerns: [],
  recommendation: "strong_hire",
  confidence_score: 0.9,
  created_at: "2026-01-15T10:35:00Z",
};

async function setupClipsMocks(
  page: import("@playwright/test").Page,
  options?: { emptyClips?: boolean }
) {
  const clips = options?.emptyClips ? [] : MOCK_CLIPS;

  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/clips") && !url.includes("/clip-collections")) {
      if (url.includes("/clips/session/") && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(clips),
        });
      } else if (url.includes("/clips/generate/") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_CLIPS),
        });
      } else if (url.includes("/clips/public/")) {
        const token = url.split("/clips/public/")[1];
        if (token === "valid-token") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(MOCK_CLIPS[0]),
          });
        } else if (token === "expired-token") {
          await route.fulfill({
            status: 410,
            contentType: "application/json",
            body: JSON.stringify({ detail: "This shared link has expired" }),
          });
        } else {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Clip not found" }),
          });
        }
      } else if (url.includes("/clips/") && url.match(/\/clips\/[a-z0-9-]+$/) && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_CLIPS[0]),
        });
      } else if (url.includes("/clips/") && method === "DELETE") {
        await route.fulfill({ status: 204 });
      } else if (url.includes("/clips/") && url.includes("/share") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            share_url: "http://localhost:3000/clips/valid-token",
            share_token: "valid-token",
            expires_at: "2026-01-18T00:00:00Z",
          }),
        });
      } else if (method === "GET" && /\/api\/v1\/clips(\?|$)/.test(url) && !url.includes("/clips/session/") && !url.includes("/clips/generate/") && !url.includes("/clips/public/")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(clips),
        });
      } else {
        await route.continue();
      }
    } else if (url.includes("/clip-collections")) {
      if (url.includes("/clips/public/")) {
        await route.continue();
      } else if (url.match(/\/clip-collections$/) && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "coll-1",
              title: "Top candidates",
              description: "Best clips",
              clip_ids: ["clip-1"],
              share_token: null,
              created_at: "2026-01-15T11:00:00Z",
            },
          ]),
        });
      } else if (url.match(/\/clip-collections$/) && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "coll-new",
            title: "New Collection",
            description: "",
            clip_ids: [],
            share_token: null,
            created_at: "2026-01-15T11:00:00Z",
          }),
        });
      } else if (url.includes("/clip-collections/public/")) {
        const token = url.split("/clip-collections/public/")[1];
        if (token === "valid-coll-token") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: "coll-1",
              title: "Shared Collection",
              description: "",
              clip_ids: ["clip-1"],
              created_at: "2026-01-15T11:00:00Z",
              clips: MOCK_CLIPS,
            }),
          });
        } else {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Collection not found" }),
          });
        }
      } else {
        await route.continue();
      }
    } else {
      await route.continue();
    }
  });
}

test.describe("Clips", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("clips page renders", async ({ page }) => {
    await setupClipsMocks(page);
    await page.goto("/dashboard/clips");

    await expect(page.getByRole("heading", { name: "Interview Clip Studio" })).toBeVisible();
    await expect(page.getByText("AI-extracted key moments")).toBeVisible();
  });

  test("clip cards display", async ({ page }) => {
    await setupClipsMocks(page);
    await page.goto("/dashboard/clips");

    await expect(page.getByText("Exceptional System Design Answer")).toBeVisible();
    await expect(page.getByText("Concerning response on testing")).toBeVisible();
    await expect(page.getByText("best answer", { exact: false })).toBeVisible();
    await expect(page.getByText("red flag", { exact: false })).toBeVisible();
  });

  test("filter dropdown", async ({ page }) => {
    await setupClipsMocks(page);
    await page.goto("/dashboard/clips");

    await page.getByRole("button", { name: "Filters" }).click();
    await expect(page.getByLabel("Type")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Type" })).toBeVisible();
  });

  test("empty state when no clips", async ({ page }) => {
    await setupClipsMocks(page, { emptyClips: true });
    await page.goto("/dashboard/clips");

    await expect(page.getByText("No clips yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to Interviews" })).toBeVisible();
  });

  test("generate button on interview detail", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.match(/\/interviews\/sess-1$/) && !url.includes("/messages") && !url.includes("/comments")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_SESSION),
        });
      } else if (url.includes("/reports/sess-1") && !url.includes("/reports/sess-1/")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_REPORT),
        });
      } else if (url.includes("/interviews/sess-1/messages")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { id: "m1", role: "interviewer", content: "Q1", media_url: null, created_at: "2026-01-15T10:00:00Z" },
            { id: "m2", role: "candidate", content: "A1", media_url: null, created_at: "2026-01-15T10:01:00Z" },
          ]),
        });
      } else if (url.includes("/clips/session/sess-1")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else if (url.includes("/clips/generate/sess-1") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_CLIPS),
        });
      } else if (url.includes("/proctoring/")) {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      } else if (url.includes("/reports/sess-1/comments")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else if (url.includes("/users/org-members") || url.includes("/users/me")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "user-1",
            email: "admin@test.com",
            full_name: "Admin",
            role: "admin",
            is_active: true,
            created_at: "2026-01-01T00:00:00Z",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/interviews/sess-1");

    await page.getByRole("tab", { name: "Clips" }).click();
    await expect(page.getByText("Interview Clips")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate Clips" })).toBeVisible();

    await page.getByRole("button", { name: "Generate Clips" }).click();
    await expect(page.getByText("Exceptional System Design Answer")).toBeVisible();
  });

  test("share link copies to clipboard", async ({ page }) => {
    await setupClipsMocks(page);
    await page.goto("/dashboard/clips");

    await page.getByLabel("Share").first().click();
    await expect(page.getByText("Share link copied to clipboard")).toBeVisible();
  });

  test("public clip viewer", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/clips/public/valid-token")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_CLIPS[0]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/clips/valid-token");

    await expect(page.getByText("Exceptional System Design Answer")).toBeVisible();
    await expect(page.getByText("best answer", { exact: false })).toBeVisible();
    await expect(page.getByText("Transcript excerpt")).toBeVisible();
  });

  test("public clip viewer - expired", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/clips/public/expired-token")) {
        await route.fulfill({
          status: 410,
          contentType: "application/json",
          body: JSON.stringify({ detail: "This shared link has expired" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/clips/expired-token");

    await expect(page.getByText("This shared link has expired")).toBeVisible();
  });

  test("navigation sidebar has Clips link", async ({ page }) => {
    await page.goto("/dashboard");
    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar.getByRole("link", { name: "Clips" })).toBeVisible();
  });
});
