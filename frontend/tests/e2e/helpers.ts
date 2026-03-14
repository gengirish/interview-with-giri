import { Page } from "@playwright/test";

/** Pattern to match API requests for route interception */
export const API_PATTERN = /\/api\/v1\//;

/** Mock JWT token for authenticated tests */
export const MOCK_TOKEN = "mock-jwt-token-for-e2e";
export const MOCK_ROLE = "admin";
export const MOCK_ORG_ID = "org-123";

/** Mock dashboard stats */
export const MOCK_DASHBOARD_STATS = {
  total_interviews: 42,
  completed_interviews: 38,
  active_jobs: 5,
  avg_score: 78.5,
  interviews_this_month: 12,
  pass_rate: 85,
};

/** Mock job postings */
export const MOCK_JOBS = [
  {
    id: "job-1",
    org_id: MOCK_ORG_ID,
    title: "Senior Backend Engineer",
    role_type: "technical",
    job_description: "Looking for a senior backend engineer with Python and FastAPI experience.",
    required_skills: ["Python", "FastAPI", "PostgreSQL"],
    interview_format: "text",
    interview_config: { num_questions: 10, duration_minutes: 30, difficulty: "medium", include_coding: false },
    is_active: true,
    created_at: "2024-01-15T10:00:00Z",
  },
];

/** Mock login/signup response */
export const MOCK_TOKEN_RESPONSE = {
  access_token: MOCK_TOKEN,
  token_type: "bearer",
  expires_in: 3600,
  role: MOCK_ROLE,
  org_id: MOCK_ORG_ID,
};

/** Mock public interview (consent phase) */
export const MOCK_PUBLIC_INTERVIEW = {
  status: "pending",
  job_title: "Senior Backend Engineer",
  job_description: "Looking for a senior backend engineer with Python experience.",
  format: "text",
  interview_config: { num_questions: 10, duration_minutes: 30 },
};

/**
 * Set auth state in localStorage before navigating.
 * Use in authenticated tests - call before page.goto().
 */
export async function setAuthState(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(
    ({ token, role, orgId }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("role", role);
      localStorage.setItem("org_id", orgId);
    },
    { token: MOCK_TOKEN, role: MOCK_ROLE, orgId: MOCK_ORG_ID }
  );
}

/**
 * Route API requests - matches any URL containing /api/v1/
 * Use route.fulfill() in the handler for custom responses.
 */
export function routeApi(
  page: Page,
  handler: (url: string, route: { fulfill: (opts: object) => Promise<void>; request: () => { url: () => string } }) => void | Promise<void>
): Promise<void> {
  return page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    await handler(url, {
      fulfill: route.fulfill.bind(route),
      request: route.request.bind(route),
    });
  });
}

/**
 * Mock a specific API endpoint with a JSON response.
 */
export function mockApi(
  page: Page,
  pathPattern: string | RegExp,
  response: object,
  status = 200
): Promise<void> {
  return page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const matches =
      typeof pathPattern === "string"
        ? url.includes(pathPattern)
        : pathPattern.test(url);
    if (matches) {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(response),
      });
    } else {
      await route.continue();
    }
  });
}

/** Mock interviews list */
export const MOCK_INTERVIEWS = {
  items: [],
  total: 0,
  page: 1,
  per_page: 10,
};

/** Mock analytics */
export const MOCK_ANALYTICS_OVERVIEW = {
  total_interviews: 42,
  completed_interviews: 38,
  completion_rate: 90,
  avg_score: 78.5,
  avg_duration_minutes: 25,
  score_distribution: {},
  status_breakdown: {},
  format_breakdown: {},
};

export const MOCK_ANALYTICS_PER_JOB: object[] = [];

/** Mock users (for team page) */
export const MOCK_USERS: object[] = [];

/** Mock decision trees */
export const MOCK_DECISION_TREES: object[] = [];

/**
 * Setup common mocks for dashboard (stats, job postings, interviews, analytics, users).
 * All API calls are mocked - no real backend needed.
 */
export async function setupDashboardMocks(page: Page, options?: {
  stats?: object;
  jobs?: object[];
  emptyJobs?: boolean;
  interviews?: object;
  analyticsOverview?: object;
  analyticsPerJob?: object[];
  users?: object[];
  decisionTrees?: object[];
}): Promise<void> {
  const stats = options?.stats ?? MOCK_DASHBOARD_STATS;
  const jobs = options?.emptyJobs
    ? { items: [], total: 0, page: 1, per_page: 10 }
    : {
        items: options?.jobs ?? MOCK_JOBS,
        total: (options?.jobs ?? MOCK_JOBS).length,
        page: 1,
        per_page: 10,
      };
  const interviews = options?.interviews ?? MOCK_INTERVIEWS;
  const analyticsOverview = options?.analyticsOverview ?? MOCK_ANALYTICS_OVERVIEW;
  const analyticsPerJob = options?.analyticsPerJob ?? MOCK_ANALYTICS_PER_JOB;
  const users = options?.users ?? MOCK_USERS;
  const decisionTrees = options?.decisionTrees ?? MOCK_DECISION_TREES;

  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/dashboard/stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(stats),
      });
    } else if (url.includes("/generate-link") && route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "test-token-123",
          interview_url: "http://localhost:3000/interview/test-token-123",
        }),
      });
    } else if (url.includes("/job-postings") && !url.includes("/extract-skills")) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(jobs),
        });
      } else if (method === "POST" && !url.match(/\/job-postings\/[^/]+\//)) {
        const newJob = { ...MOCK_JOBS[0], id: "job-new", title: "New Job" };
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(newJob),
        });
      } else if (method === "DELETE") {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      } else {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      }
    } else if (url.includes("/interviews") && !url.includes("/public/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(interviews),
      });
    } else if (url.includes("/analytics/overview")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(analyticsOverview),
      });
    } else if (url.includes("/analytics/per-job")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(analyticsPerJob),
      });
    } else if (url.includes("/users/me/walkthrough")) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ completed: {}, skipped: {}, version: 1 }),
        });
      } else if (method === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ completed: {}, skipped: {}, version: 1 }),
        });
      } else {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      }
    } else if (url.includes("/users") && !url.includes("/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(users),
      });
    } else if (url.includes("/decision-trees") && !url.includes("/validate")) {
      if (method === "GET" && !url.match(/\/decision-trees\/[^/]+\//)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(decisionTrees),
        });
      } else if (method === "GET" && url.match(/\/decision-trees\/[^/]+$/)) {
        const id = url.split("/decision-trees/")[1]?.split("/")[0];
        const tree = Array.isArray(decisionTrees)
          ? (decisionTrees as { id: string }[]).find((t) => t.id === id)
          : null;
        await route.fulfill({
          status: tree ? 200 : 404,
          contentType: "application/json",
          body: tree ? JSON.stringify(tree) : JSON.stringify({ detail: "Not found" }),
        });
      } else {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      }
    } else {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not mocked" }) });
    }
  });
}
