import { test, expect, Page } from "@playwright/test";
import {
  setAuthState,
  setupDashboardMocks,
  API_PATTERN,
  MOCK_JOBS,
  MOCK_ORG_ID,
  MOCK_ROLE,
  MOCK_TOKEN,
} from "./helpers";

const LS_KEY = "walkthrough_progress";

/** Clear walkthrough progress from localStorage so tours trigger fresh. */
async function clearWalkthroughProgress(page: Page) {
  await page.evaluate((key) => localStorage.removeItem(key), LS_KEY);
}

/** Pre-seed walkthrough_progress in localStorage. */
async function seedWalkthroughProgress(
  page: Page,
  state: { completed?: Record<string, boolean>; skipped?: Record<string, boolean> }
) {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: LS_KEY, value: { completed: {}, skipped: {}, version: 1, ...state } }
  );
}

/** Wait for the Joyride tooltip to appear. */
async function waitForTooltip(page: Page) {
  await page.waitForSelector('[class*="react-joyride"] [role="alertdialog"], [class*="react-joyride__tooltip"]', {
    timeout: 5000,
  }).catch(() => {});
}

/** Auth state with a non-admin role for role-gated tour tests. */
async function setViewerAuthState(page: Page) {
  await page.goto("/");
  await page.evaluate(
    ({ token, role, orgId }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("role", role);
      localStorage.setItem("org_id", orgId);
    },
    { token: MOCK_TOKEN, role: "viewer", orgId: MOCK_ORG_ID }
  );
}

// ---------------------------------------------------------------------------
// Help Button
// ---------------------------------------------------------------------------

test.describe("HelpButton", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("is visible on the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("help-button")).toBeVisible();
    await expect(
      page.getByTestId("help-button").getByRole("button", { name: "Help and tours" })
    ).toBeVisible();
  });

  test("opens a dropdown with Replay and Reset options", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Help and tours" }).click();

    await expect(page.getByText("Replay page tour")).toBeVisible();
    await expect(page.getByText("Reset all tours")).toBeVisible();
  });

  test("closes the dropdown when clicking outside", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Help and tours" }).click();
    await expect(page.getByText("Replay page tour")).toBeVisible();

    await page.locator("header").click();
    await expect(page.getByText("Replay page tour")).not.toBeVisible();
  });

  test("closes the dropdown on Escape key", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Help and tours" }).click();
    await expect(page.getByText("Replay page tour")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText("Replay page tour")).not.toBeVisible();
  });

  test("is visible on Jobs page", async ({ page }) => {
    await page.goto("/dashboard/jobs");
    await expect(page.getByTestId("help-button")).toBeVisible();
  });

  test("is visible on Interviews page", async ({ page }) => {
    await page.goto("/dashboard/interviews");
    await expect(page.getByTestId("help-button")).toBeVisible();
  });

  test("is hidden on candidate interview page", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/public/")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            token: "test-token",
            status: "pending",
            format: "text",
            job_title: "Test Job",
            job_description: "Test description for the candidate",
            interview_config: { num_questions: 5, duration_minutes: 20, difficulty: "medium" },
            branding: {},
            is_practice: false,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        });
      }
    });

    await page.goto("/interview/some-token-123");
    await expect(page.getByTestId("help-button")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tour Auto-Start
// ---------------------------------------------------------------------------

test.describe("Tour Auto-Start", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("dashboard tour auto-starts when no prior progress exists", async ({ page }) => {
    await clearWalkthroughProgress(page);
    await page.goto("/dashboard");

    await page.waitForTimeout(1500);
    await expect(page.getByText("Your Hiring Metrics")).toBeVisible();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
  });

  test("dashboard tour does NOT auto-start when already completed", async ({ page }) => {
    await seedWalkthroughProgress(page, {
      completed: { "dashboard-overview": true },
    });
    await page.goto("/dashboard");

    await page.waitForTimeout(1500);
    await expect(page.getByText("Your Hiring Metrics")).not.toBeVisible();
  });

  test("dashboard tour does NOT auto-start when previously skipped", async ({ page }) => {
    await seedWalkthroughProgress(page, {
      skipped: { "dashboard-overview": true },
    });
    await page.goto("/dashboard");

    await page.waitForTimeout(1500);
    await expect(page.getByText("Your Hiring Metrics")).not.toBeVisible();
  });

  test("jobs tour auto-starts on first visit to Jobs page", async ({ page }) => {
    await clearWalkthroughProgress(page);
    await page.goto("/dashboard/jobs");

    await page.waitForTimeout(1500);
    await expect(page.getByRole("heading", { name: "Your Job Postings" })).toBeVisible();
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
  });

  test("landing page tour auto-starts for unauthenticated visitors", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((key) => localStorage.removeItem(key), LS_KEY);
    await page.reload();

    await page.waitForTimeout(1500);
    await expect(page.getByText("Welcome to Interview Bot")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tour Navigation (Next / Back / Skip / Done)
// ---------------------------------------------------------------------------

test.describe("Tour Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
    await clearWalkthroughProgress(page);
  });

  test("Next button advances to the next step", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    await expect(page.getByText("Your Hiring Metrics")).toBeVisible();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();

    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Getting Started Checklist")).toBeVisible();
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
  });

  test("Back button returns to the previous step", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Step 2 of 4")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await expect(page.getByText("Your Hiring Metrics")).toBeVisible();
  });

  test("Back button is hidden on the first step", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await expect(page.getByRole("button", { name: "Back" })).not.toBeVisible();
  });

  test("Skip button closes the tour and marks it as skipped", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    await expect(page.getByText("Your Hiring Metrics")).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();

    await expect(page.getByText("Your Hiring Metrics")).not.toBeVisible();

    const progress = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, LS_KEY);
    expect(progress?.skipped?.["dashboard-overview"]).toBe(true);
  });

  test("Done button on last step completes the tour", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Next" }).click();
    }

    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await expect(page.getByText("Navigation")).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Navigation")).not.toBeVisible();

    const progress = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, LS_KEY);
    expect(progress?.completed?.["dashboard-overview"]).toBe(true);
  });

  test("Close (X) button dismisses the tour and marks it as skipped", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    await expect(page.getByText("Your Hiring Metrics")).toBeVisible();
    await page.getByRole("button", { name: "Close tour" }).click();

    await expect(page.getByText("Your Hiring Metrics")).not.toBeVisible();

    const progress = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, LS_KEY);
    expect(progress?.skipped?.["dashboard-overview"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CustomTooltip Rendering
// ---------------------------------------------------------------------------

test.describe("CustomTooltip", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
    await clearWalkthroughProgress(page);
  });

  test("displays title and body content", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    await expect(page.getByText("Your Hiring Metrics")).toBeVisible();
    await expect(
      page.getByText("See an overview of active jobs, total interviews")
    ).toBeVisible();
  });

  test("displays step progress counter", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    await expect(page.getByText("Step 1 of 4")).toBeVisible();

    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
  });

  test("renders Next, Skip, and Close buttons", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close tour" })).toBeVisible();
  });

  test("last step shows Done instead of Next, and no Skip button", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Next" }).click();
    }

    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Skip" })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// localStorage Persistence
// ---------------------------------------------------------------------------

test.describe("localStorage Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("completed tour persists in localStorage", async ({ page }) => {
    await clearWalkthroughProgress(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Next" }).click();
    }
    await page.getByRole("button", { name: "Done" }).click();

    const progress = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, LS_KEY);

    expect(progress).toBeTruthy();
    expect(progress.completed["dashboard-overview"]).toBe(true);
    expect(progress.version).toBe(1);
  });

  test("completed tour does not auto-start after page reload", async ({ page }) => {
    await seedWalkthroughProgress(page, {
      completed: { "dashboard-overview": true },
    });

    await page.goto("/dashboard");
    await page.waitForTimeout(1500);
    await expect(page.getByText("Your Hiring Metrics")).not.toBeVisible();
  });

  test("Reset all tours clears localStorage and re-enables auto-start", async ({ page }) => {
    await seedWalkthroughProgress(page, {
      completed: { "dashboard-overview": true, "jobs-page": true },
      skipped: { "analytics-page": true },
    });
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Help and tours" }).click();
    await page.getByText("Reset all tours").click();

    const progress = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, LS_KEY);

    expect(progress.completed).toEqual({});
    expect(progress.skipped).toEqual({});
  });

  test("multiple tours can coexist in progress state", async ({ page }) => {
    await seedWalkthroughProgress(page, {
      completed: { "dashboard-overview": true },
    });
    await page.goto("/dashboard/jobs");
    await page.waitForTimeout(1500);

    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Next" }).click();
    }
    await page.getByRole("button", { name: "Done" }).click();

    const progress = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, LS_KEY);

    expect(progress.completed["dashboard-overview"]).toBe(true);
    expect(progress.completed["jobs-page"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Replay Tour via Help Button
// ---------------------------------------------------------------------------

test.describe("Replay Tour", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("Replay page tour restarts the current page's tour", async ({ page }) => {
    await seedWalkthroughProgress(page, {
      completed: { "dashboard-overview": true },
    });
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Help and tours" }).click();
    await page.getByText("Replay page tour").click();

    await expect(page.getByText("Your Hiring Metrics")).toBeVisible();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
  });

  test("help button hides while a tour is running", async ({ page }) => {
    await clearWalkthroughProgress(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    await expect(page.getByText("Your Hiring Metrics")).toBeVisible();
    await expect(page.getByTestId("help-button")).not.toBeVisible();
  });

  test("help button reappears after tour completes", async ({ page }) => {
    await clearWalkthroughProgress(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Next" }).click();
    }
    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.getByTestId("help-button")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Server Sync (PATCH /users/me/walkthrough)
// ---------------------------------------------------------------------------

test.describe("Server Sync", () => {
  test("completing a tour sends PATCH to /users/me/walkthrough", async ({ page }) => {
    const patchRequests: { body: string }[] = [];

    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes("/users/me/walkthrough") && method === "PATCH") {
        patchRequests.push({ body: await route.request().postData() || "" });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ completed: {}, skipped: {}, version: 1 }),
        });
      } else if (url.includes("/users/me/walkthrough") && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ completed: {}, skipped: {}, version: 1 }),
        });
      } else if (url.includes("/dashboard/stats")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            total_interviews: 42, completed_interviews: 38,
            active_jobs: 5, avg_score: 78.5,
            interviews_this_month: 12, pass_rate: 85,
          }),
        });
      } else if (url.includes("/job-postings")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_JOBS, total: 1, page: 1, per_page: 10 }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });

    await setAuthState(page);
    await clearWalkthroughProgress(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Next" }).click();
    }
    await page.getByRole("button", { name: "Done" }).click();

    // Debounced sync is 2s — wait for it
    await page.waitForTimeout(3000);

    expect(patchRequests.length).toBeGreaterThanOrEqual(1);
    const lastBody = JSON.parse(patchRequests[patchRequests.length - 1].body);
    expect(lastBody.completed?.["dashboard-overview"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// data-tour Attribute Coverage
// ---------------------------------------------------------------------------

test.describe("data-tour Attributes", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
    await seedWalkthroughProgress(page, {
      completed: {
        "dashboard-overview": true,
        "jobs-page": true,
        "interviews-page": true,
        "reports-page": true,
        "analytics-page": true,
        "settings-page": true,
        "team-page": true,
      },
    });
  });

  test("dashboard page has expected data-tour targets", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator('[data-tour="stats-cards"]')).toBeVisible();
    await expect(page.locator('[data-tour="getting-started"]')).toBeVisible();
    await expect(page.locator('[data-tour="quick-actions"]')).toBeVisible();
  });

  test("jobs page has expected data-tour targets", async ({ page }) => {
    await page.goto("/dashboard/jobs");
    await expect(page.locator('[data-tour="jobs-list"]')).toBeVisible();
    await expect(page.locator('[data-tour="create-job"]')).toBeVisible();
    await expect(page.locator('[data-tour="jobs-filter"]')).toBeVisible();
    await expect(page.locator('[data-tour="job-format"]')).toBeVisible();
    await expect(page.locator('[data-tour="generate-link"]')).toBeVisible();
  });

  test("interviews page has expected data-tour targets", async ({ page }) => {
    await setupDashboardMocks(page, {
      interviews: {
        items: [
          {
            id: "sess-1",
            job_posting_id: "job-1",
            token: "tok123456789",
            candidate_name: "Alice",
            candidate_email: "alice@example.com",
            status: "completed",
            format: "text",
            overall_score: 8.5,
            duration_seconds: 1200,
            started_at: "2024-01-15T10:00:00Z",
            completed_at: "2024-01-15T10:20:00Z",
            created_at: "2024-01-15T09:55:00Z",
          },
        ],
        total: 1,
        page: 1,
        per_page: 20,
      },
    });
    await page.goto("/dashboard/interviews");
    await expect(page.locator('[data-tour="interviews-table"]')).toBeVisible();
    await expect(page.locator('[data-tour="interview-status"]')).toBeVisible();
    await expect(page.locator('[data-tour="interview-score"]')).toBeVisible();
    await expect(page.locator('[data-tour="interview-actions"]')).toBeVisible();
  });

  test("landing page has expected data-tour targets", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-tour="hero"]')).toBeVisible();
    await expect(page.locator('[data-tour="features"]')).toBeVisible();
    await expect(page.locator('[data-tour="how-it-works"]')).toBeAttached();
    await expect(page.locator('[data-tour="pricing"]')).toBeAttached();
    await expect(page.locator('[data-tour="cta"]')).toBeAttached();
  });
});

// ---------------------------------------------------------------------------
// Cross-Page Tour Independence
// ---------------------------------------------------------------------------

test.describe("Cross-Page Tour Independence", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
    await clearWalkthroughProgress(page);
  });

  test("completing dashboard tour does not suppress jobs tour", async ({ page }) => {
    await seedWalkthroughProgress(page, {
      completed: { "dashboard-overview": true },
    });
    await page.goto("/dashboard/jobs");
    await page.waitForTimeout(1500);

    await expect(page.getByRole("heading", { name: "Your Job Postings" })).toBeVisible();
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
  });

  test("skipping one tour does not affect other tours", async ({ page }) => {
    await seedWalkthroughProgress(page, {
      skipped: { "dashboard-overview": true },
    });
    await page.goto("/dashboard/jobs");
    await page.waitForTimeout(1500);

    await expect(page.getByRole("heading", { name: "Your Job Postings" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Role-Based Tour Visibility
// ---------------------------------------------------------------------------

test.describe("Role-Based Tours", () => {
  test("settings tour is available for admin users", async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page); // admin role
    await seedWalkthroughProgress(page, {
      completed: { "settings-page": true },
    });

    await page.goto("/dashboard/settings");
    await page.getByRole("button", { name: "Help and tours" }).click();
    await expect(page.getByText("Replay page tour")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Landing Page Walkthrough (unauthenticated)
// ---------------------------------------------------------------------------

test.describe("Landing Page Walkthrough", () => {
  test("tour works without authentication (localStorage only)", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((key) => localStorage.removeItem(key), LS_KEY);
    await page.reload();

    await page.waitForTimeout(1500);
    await expect(page.getByText("Welcome to Interview Bot")).toBeVisible();
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
  });

  test("completing landing tour persists in localStorage", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((key) => localStorage.removeItem(key), LS_KEY);
    await page.reload();
    await page.waitForTimeout(1500);

    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Next" }).click();
    }
    await page.getByRole("button", { name: "Done" }).click();

    const progress = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, LS_KEY);

    expect(progress?.completed?.["landing-overview"]).toBe(true);
  });

  test("landing tour does not auto-start if already completed", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      { key: LS_KEY, value: { completed: { "landing-overview": true }, skipped: {}, version: 1 } }
    );
    await page.reload();
    await page.waitForTimeout(1500);

    await expect(page.getByText("Welcome to Interview Bot")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Spotlight Overlay
// ---------------------------------------------------------------------------

test.describe("Spotlight Overlay", () => {
  test("overlay is visible while tour is running", async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
    await clearWalkthroughProgress(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    const overlay = page.locator('[class*="react-joyride__overlay"]');
    await expect(overlay).toBeVisible();
  });

  test("overlay is removed after tour completes", async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
    await clearWalkthroughProgress(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Next" }).click();
    }
    await page.getByRole("button", { name: "Done" }).click();

    const overlay = page.locator('[class*="react-joyride__overlay"]');
    await expect(overlay).not.toBeVisible();
  });
});
