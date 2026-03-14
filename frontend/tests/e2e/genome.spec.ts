import { test, expect } from "@playwright/test";
import {
  setAuthState,
  setupDashboardMocks,
  API_PATTERN,
} from "./helpers";

const MOCK_GENOMES = {
  items: [
    {
      id: "genome-1",
      candidate_email: "alice@example.com",
      candidate_name: "Alice Smith",
      genome_data: {
        dimensions: {
          problem_solving: { score: 8.5, confidence: 0.9, sources: [] },
          communication: { score: 7.0, confidence: 0.8, sources: [] },
          system_design: { score: 8.0, confidence: 0.85, sources: [] },
        },
        interview_count: 2,
      },
      version: 1,
    },
    {
      id: "genome-2",
      candidate_email: "bob@example.com",
      candidate_name: "Bob Johnson",
      genome_data: {
        dimensions: {
          problem_solving: { score: 6.0, confidence: 0.7, sources: [] },
          communication: { score: 8.0, confidence: 0.9, sources: [] },
        },
        interview_count: 1,
      },
      version: 1,
    },
  ],
  total: 2,
};

const MOCK_ROLE_PROFILES = {
  items: [
    {
      id: "profile-1",
      role_type: "technical",
      title: "Senior Backend Engineer",
      ideal_genome: {
        problem_solving: { ideal: 8, min: 6, weight: 1.0 },
        communication: { ideal: 7, min: 5, weight: 1.0 },
      },
    },
  ],
};

const MOCK_COMPARE_RESULT = {
  candidates: [
    {
      email: "alice@example.com",
      name: "Alice Smith",
      genome_data: {
        dimensions: {
          problem_solving: { score: 8.5 },
          communication: { score: 7.0 },
        },
      },
    },
    {
      email: "bob@example.com",
      name: "Bob Johnson",
      genome_data: {
        dimensions: {
          problem_solving: { score: 6.0 },
          communication: { score: 8.0 },
        },
      },
    },
  ],
};

async function setupGenomeMocks(page: import("@playwright/test").Page, options?: {
  genomes?: typeof MOCK_GENOMES;
  emptyGenomes?: boolean;
}) {
  const genomes = options?.emptyGenomes
    ? { items: [], total: 0 }
    : options?.genomes ?? MOCK_GENOMES;

  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/genome/candidates")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(genomes),
      });
    } else if (url.includes("/genome/role-profiles") && !url.match(/\/role-profiles\/[^/]+/)) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_ROLE_PROFILES),
        });
      } else if (method === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "profile-new",
            role_type: "technical",
            title: "New Profile",
            ideal_genome: {},
          }),
        });
      } else {
        await route.continue();
      }
    } else if (url.includes("/genome/compare") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_COMPARE_RESULT),
      });
    } else if (url.includes("/genome/candidate/") && method === "GET") {
      const email = decodeURIComponent(url.split("/candidate/")[1] || "");
      const candidate = genomes.items.find(
        (g: { candidate_email: string }) => g.candidate_email === email
      );
      if (candidate) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(candidate),
        });
      } else {
        await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      }
    } else if (url.includes("/genome/rebuild/") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_GENOMES.items[0]),
      });
    } else {
      await route.continue();
    }
  });
}

test.describe("Genome", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await setAuthState(page);
  });

  test("genome page renders with search bar", async ({ page }) => {
    await setupGenomeMocks(page);
    await page.goto("/dashboard/genome");

    await expect(page.getByRole("heading", { name: "Competency Genome" })).toBeVisible();
    await expect(
      page.getByPlaceholder("Search by email or name...")
    ).toBeVisible();
  });

  test("candidate genome cards display", async ({ page }) => {
    await setupGenomeMocks(page);
    await page.goto("/dashboard/genome");

    await expect(page.getByText("Alice Smith")).toBeVisible();
    await expect(page.getByText("alice@example.com")).toBeVisible();
    await expect(page.getByText("2 interviews")).toBeVisible();
    await expect(page.getByText("Bob Johnson")).toBeVisible();
  });

  test("empty state when no genomes", async ({ page }) => {
    await setupGenomeMocks(page, { emptyGenomes: true });
    await page.goto("/dashboard/genome");

    await expect(page.getByText("No genomes yet")).toBeVisible();
  });

  test("role profiles page renders", async ({ page }) => {
    await setupGenomeMocks(page);
    await page.goto("/dashboard/genome/profiles");

    await expect(page.getByRole("heading", { name: "Role Genome Profiles" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Senior Backend Engineer")).toBeVisible();
  });

  test("role profile creation form", async ({ page }) => {
    let createdProfiles: { id: string; role_type: string; title: string }[] = [];
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/genome/role-profiles") && !url.match(/\/role-profiles\/[^/]+$/)) {
        if (method === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ items: createdProfiles }),
          });
        } else if (method === "POST") {
          const body = JSON.parse(route.request().postData() || "{}");
          const newProfile = {
            id: "profile-new",
            role_type: body.role_type || "technical",
            title: body.title || "Test Engineer",
            ideal_genome: body.ideal_genome || {},
          };
          createdProfiles = [...createdProfiles, newProfile];
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify(newProfile),
          });
        } else {
          await route.continue();
        }
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/genome/profiles");

    await page.getByRole("button", { name: "Create Profile" }).click();
    await expect(page.getByRole("heading", { name: "New Role Profile" })).toBeVisible({ timeout: 3000 });

    await page.getByPlaceholder("e.g. Senior Backend Engineer").fill("Test Engineer");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("Test Engineer")).toBeVisible({ timeout: 5000 });
  });

  test("genome page link to role profiles", async ({ page }) => {
    await setupGenomeMocks(page);
    await page.goto("/dashboard/genome");

    await page.getByRole("link", { name: "Role Profiles" }).click();
    await expect(page).toHaveURL(/\/dashboard\/genome\/profiles/);
  });

  test("navigation sidebar has Genome link", async ({ page }) => {
    await page.goto("/dashboard");
    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar.getByRole("link", { name: "Genome" })).toBeVisible();
  });

  test("genome tab on interview detail", async ({ page }) => {
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
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else if (url.includes("/genome/candidate/") && url.includes("alice")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_GENOMES.items[0]),
        });
      } else if (url.includes("/genome/rebuild/") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_GENOMES.items[0]),
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

    await page.getByRole("tab", { name: "Genome" }).click();
    await expect(page.getByText("Competency Genome")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/interviews contributed/)).toBeVisible();
  });

  test("compare view", async ({ page }) => {
    await setupGenomeMocks(page);
    await page.goto("/dashboard/genome");

    await page.getByTitle("Add to compare").first().click();
    await page.getByTitle("Add to compare").nth(1).click();
    await page.getByRole("button", { name: /Compare \(2\)/ }).click();

    await expect(page.getByText("Side-by-Side Comparison")).toBeVisible();
    await expect(page.getByText("Alice Smith")).toBeVisible();
    await expect(page.getByText("Bob Johnson")).toBeVisible();
  });
});
