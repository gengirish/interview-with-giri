import { test, expect } from "@playwright/test";
import {
  setAuthState,
  setupDashboardMocks,
  API_PATTERN,
} from "./helpers";

const MOCK_PREDICTION_STATUS_NO_MODEL = {
  model: null,
  trainable_outcomes: 3,
  outcomes_needed: 10,
};

const MOCK_PREDICTION_STATUS_WITH_MODEL = {
  model: {
    id: "model-1",
    model_version: 1,
    training_sample_size: 15,
    feature_weights: { overall_score: 0.4, recommendation_score: 0.3 },
    accuracy_metrics: { accuracy: 0.78, sample_size: 15 },
    is_active: true,
    trained_at: "2026-01-15T10:00:00Z",
  },
  trainable_outcomes: 15,
  outcomes_needed: 10,
};

const MOCK_OUTCOMES_EMPTY = {
  items: [],
  total: 0,
  page: 1,
  per_page: 20,
};

const MOCK_OUTCOMES = {
  items: [
    {
      id: "out-1",
      session_id: "sess-1",
      candidate_email: "alice@example.com",
      was_hired: true,
      performance_rating: 4.2,
      retention_months: 12,
      is_still_employed: true,
      created_at: "2026-01-15T10:00:00Z",
    },
  ],
  total: 1,
  page: 1,
  per_page: 20,
};

const MOCK_INSIGHTS_EMPTY = {
  feature_importance: [],
  message: "No trained model yet",
};

const MOCK_INSIGHTS = {
  feature_importance: [
    { factor: "Overall Score", weight: 0.4, impact: "positive" },
    { factor: "Recommendation Score", weight: 0.3, impact: "positive" },
    { factor: "Concerns Count", weight: -0.2, impact: "negative" },
  ],
};

const MOCK_PREDICTION = {
  success_probability: 0.72,
  confidence: "low",
  contributing_factors: [
    { factor: "High interview score", value: 8, impact: "positive" },
    { factor: "Strong hire recommendation", impact: "positive" },
  ],
  risk_factors: [],
  is_heuristic: true,
};

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
  ai_summary: "Strong candidate",
  strengths: [],
  concerns: [],
  recommendation: "strong_hire",
  confidence_score: 0.9,
  created_at: "2026-01-15T10:35:00Z",
};

async function setupPredictionsMocks(
  page: import("@playwright/test").Page,
  options?: {
    status?: typeof MOCK_PREDICTION_STATUS_NO_MODEL | typeof MOCK_PREDICTION_STATUS_WITH_MODEL;
    outcomes?: typeof MOCK_OUTCOMES_EMPTY | typeof MOCK_OUTCOMES;
    insights?: typeof MOCK_INSIGHTS_EMPTY | typeof MOCK_INSIGHTS;
  }
) {
  const status = options?.status ?? MOCK_PREDICTION_STATUS_NO_MODEL;
  const outcomes = options?.outcomes ?? MOCK_OUTCOMES_EMPTY;
  const insights = options?.insights ?? MOCK_INSIGHTS_EMPTY;

  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/predictions/status")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(status),
      });
    } else if (url.includes("/predictions/outcomes") && !url.includes("/by-session/") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(outcomes),
      });
    } else if (url.includes("/predictions/insights")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(insights),
      });
    } else if (url.includes("/predictions/train") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PREDICTION_STATUS_WITH_MODEL.model),
      });
    } else {
      await route.continue();
    }
  });
}

test.describe("Predictions dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("predictions page loads and shows model health card", async ({ page }) => {
    await setupPredictionsMocks(page);
    await page.goto("/dashboard/predictions");

    await expect(page.getByTestId("model-health-card")).toBeVisible();
    await expect(page.getByText("Model Health")).toBeVisible();
  });

  test("empty model state shows progress bar", async ({ page }) => {
    await setupPredictionsMocks(page);
    await page.goto("/dashboard/predictions");

    await expect(page.getByTestId("empty-model-state")).toBeVisible();
    await expect(page.getByText(/Record .* more outcomes to train/)).toBeVisible();
  });

  test("model with data shows training stats and Retrain button", async ({ page }) => {
    await setupPredictionsMocks(page, { status: MOCK_PREDICTION_STATUS_WITH_MODEL });
    await page.goto("/dashboard/predictions");

    await expect(page.getByTestId("model-health-card")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("15")).toBeVisible();
    await expect(page.getByText("78%")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retrain" })).toBeVisible();
  });

  test("insights chart displays when model trained", async ({ page }) => {
    await setupPredictionsMocks(page, {
      status: MOCK_PREDICTION_STATUS_WITH_MODEL,
      insights: MOCK_INSIGHTS,
    });
    await page.goto("/dashboard/predictions");

    await expect(page.getByTestId("insights-chart")).toBeVisible();
    await expect(page.getByText("Which Signals Matter Most")).toBeVisible();
  });

  test("recent outcomes table shows data", async ({ page }) => {
    await setupPredictionsMocks(page, { outcomes: MOCK_OUTCOMES });
    await page.goto("/dashboard/predictions");

    await expect(page.getByText("Recent Outcomes")).toBeVisible();
    await expect(page.getByText("alice@example.com")).toBeVisible();
    await expect(page.getByText("Yes")).toBeVisible();
  });

  test("recent outcomes empty state", async ({ page }) => {
    await setupPredictionsMocks(page);
    await page.goto("/dashboard/predictions");

    await expect(page.getByText("No outcomes recorded yet")).toBeVisible();
  });
});

test.describe("Prediction tab on interview detail", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("prediction tab visible and shows success gauge", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes("/interviews/sess-1") && !url.includes("/messages") && !url.includes("/comments")) {
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
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      } else if (url.includes("/predictions/predict/sess-1")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PREDICTION),
        });
      } else if (url.includes("/predictions/outcomes/by-session/sess-1")) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not found" }) });
      } else if (url.includes("/proctoring/")) {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      } else if (url.includes("/reports/sess-1/comments")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
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
    await page.getByRole("tab", { name: "Prediction" }).click();

    await expect(page.getByTestId("prediction-tab")).toBeVisible();
    await expect(page.getByText("72%")).toBeVisible();
    await expect(page.getByText("Estimated")).toBeVisible();
    await expect(page.getByText("Contributing Factors")).toBeVisible();
    await expect(page.getByText("Risk Factors")).toBeVisible();
  });

  test("record outcome button opens form", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes("/interviews/sess-1") && !url.includes("/messages") && !url.includes("/comments")) {
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
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      } else if (url.includes("/predictions/predict/sess-1")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PREDICTION),
        });
      } else if (url.includes("/predictions/outcomes/by-session/sess-1")) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not found" }) });
      } else if (url.includes("/predictions/outcomes") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "out-1",
            session_id: "sess-1",
            candidate_email: "alice@example.com",
            was_hired: true,
            performance_rating: null,
            retention_months: null,
            is_still_employed: null,
            created_at: "2026-01-15T10:00:00Z",
          }),
        });
      } else if (url.includes("/proctoring/")) {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      } else if (url.includes("/reports/sess-1/comments")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
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
    await page.getByRole("tab", { name: "Prediction" }).click();

    await expect(page.getByRole("button", { name: "Record Outcome" })).toBeVisible();
    await page.getByRole("button", { name: "Record Outcome" }).click();

    await expect(page.getByLabel("Was hired")).toBeVisible();
    await expect(page.getByLabel("Hire date (optional)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });
});

test.describe("Predictions navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("predictions link in nav for admin", async ({ page }) => {
    await setupPredictionsMocks(page);
    await page.goto("/dashboard");

    await expect(page.getByRole("link", { name: "Predictions" })).toBeVisible();
  });
});
