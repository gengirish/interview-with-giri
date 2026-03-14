import { test, expect } from "@playwright/test";
import { API_PATTERN, setAuthState, setupDashboardMocks } from "./helpers";

const MOCK_PUBLIC_INTERVIEW = {
  status: "pending",
  job_title: "Senior Software Engineer",
  job_description: "Looking for a senior engineer with Python experience.",
  format: "text",
  interview_config: { num_questions: 10, duration_minutes: 30 },
  branding: { logo_url: "", primary_color: "#4F46E5", company_name: "Test Corp", tagline: "" },
  is_practice: true,
};

const MOCK_ACCESSIBILITY_CONFIG = {
  mode: "standard",
  preferences: {
    extended_time: false,
    time_multiplier: 1.5,
    screen_reader_optimized: false,
    high_contrast: false,
    dyslexia_friendly_font: false,
    large_text: false,
    reduced_motion: false,
    keyboard_only_navigation: false,
  },
  accommodations_notes: "",
};

const MOCK_CSS_OVERRIDES = {
  "--bg-primary": "#000000",
  "--text-primary": "#FFFFFF",
  "--font-size-base": "20px",
};

async function setupInterviewMocks(page: import("@playwright/test").Page) {
  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/interviews/public/") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PUBLIC_INTERVIEW),
      });
    } else if (url.includes("/accessibility/config/") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_ACCESSIBILITY_CONFIG),
      });
    } else if (url.includes("/accessibility/config/") && method === "PUT") {
      const body = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    } else if (url.includes("/accessibility/css-overrides/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CSS_OVERRIDES),
      });
    } else if (url.includes("/interviews/public/") && url.includes("/start") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "test-token", status: "ready", message: "Started" }),
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
        await route.continue();
      }
    } else {
      await route.continue();
    }
  });
}

test.describe("Accessibility - Interview", () => {
  test.beforeEach(async ({ page }) => {
    await setupInterviewMocks(page);
  });

  test("preference modal appears when Start Interview is clicked", async ({
    page,
  }) => {
    await page.goto("/interview/test-token-123");

    await expect(page.getByRole("heading", { name: "Ready to Begin" })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole("button", { name: "Start interview" }).click();

    await expect(page.getByRole("heading", { name: "Accessibility Options" })).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByText("We want to ensure a comfortable interview experience for everyone.")
    ).toBeVisible();
  });

  test("toggle switches work in accessibility modal", async ({ page }) => {
    await page.goto("/interview/test-token-123");
    await expect(page.getByRole("heading", { name: "Ready to Begin" })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: "Start interview" }).click();

    await expect(page.getByRole("heading", { name: "Accessibility Options" })).toBeVisible({
      timeout: 5000,
    });

    const extendedTimeCheckbox = page.getByLabel("Enable extended time");
    await extendedTimeCheckbox.check();
    await expect(extendedTimeCheckbox).toBeChecked();

    const highContrastCheckbox = page.getByLabel("High contrast mode");
    await highContrastCheckbox.check();
    await expect(highContrastCheckbox).toBeChecked();
  });

  test("skip button works and dismisses modal", async ({ page }) => {
    await page.goto("/interview/test-token-123");
    await expect(page.getByRole("heading", { name: "Ready to Begin" })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: "Start interview" }).click();

    await expect(page.getByRole("heading", { name: "Accessibility Options" })).toBeVisible({
      timeout: 5000,
    });

    await page
      .getByRole("button", {
        name: "I don't need accommodations, start interview",
      })
      .click();

    await expect(page.getByRole("heading", { name: "Accessibility Options" })).not.toBeVisible({
      timeout: 3000,
    });
  });

  test("Escape key closes accessibility modal", async ({ page }) => {
    await page.goto("/interview/test-token-123");
    await expect(page.getByRole("heading", { name: "Ready to Begin" })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: "Start interview" }).click();

    await expect(page.getByRole("heading", { name: "Accessibility Options" })).toBeVisible({
      timeout: 5000,
    });

    await page.keyboard.press("Escape");

    await expect(page.getByRole("heading", { name: "Accessibility Options" })).not.toBeVisible({
      timeout: 3000,
    });
  });

  test("Apply & Start with high contrast calls API and applies overrides", async ({
    page,
  }) => {
    let putConfigCalled = false;
    let getOverridesCalled = false;

    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes("/interviews/public/") && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PUBLIC_INTERVIEW),
        });
      } else if (url.includes("/accessibility/config/") && method === "PUT") {
        putConfigCalled = true;
        const body = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      } else if (url.includes("/accessibility/css-overrides/")) {
        getOverridesCalled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_CSS_OVERRIDES),
        });
      } else if (url.includes("/users/me/walkthrough")) {
        if (method === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ completed: {}, skipped: {}, version: 1 }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ completed: {}, skipped: {}, version: 1 }),
          });
        }
      } else {
        await route.continue();
      }
    });

    await page.goto("/interview/test-token-123");
    await expect(page.getByRole("heading", { name: "Ready to Begin" })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: "Start interview" }).click();

    await page.getByLabel("High contrast mode").check();
    await page
      .getByRole("button", {
        name: "Apply accessibility settings and start interview",
      })
      .click();

    await expect(async () => {
      expect(putConfigCalled).toBe(true);
      expect(getOverridesCalled).toBe(true);
    }).toPass({ timeout: 5000 });
  });

  test("ARIA attributes present on main content", async ({ page }) => {
    await page.goto("/interview/test-token-123");
    await expect(page.getByRole("heading", { name: "Ready to Begin" })).toBeVisible({
      timeout: 10000,
    });

    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeVisible();
  });
});

test.describe("Accessibility - Settings", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page, {
      stats: {
        total_interviews: 10,
        completed_interviews: 8,
        active_jobs: 2,
        avg_score: 7.5,
        interviews_this_month: 3,
        pass_rate: 75,
      },
    });
    await setAuthState(page);
  });

  test("accessibility section visible in settings", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/accessibility/org-settings")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            default_mode: "offer_choice",
            allowed_accommodations: [
              "extended_time",
              "screen_reader",
              "high_contrast",
              "dyslexia_font",
              "large_text",
              "reduced_motion",
              "keyboard_only",
            ],
            custom_instructions: "",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/settings");
    await page.getByRole("tab", { name: "Accessibility" }).click();

    await expect(page.getByText("Accessibility Settings")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByLabel("Default mode")).toBeVisible();
    await expect(page.getByText("Allowed accommodations")).toBeVisible();
  });

  test("accessibility default mode dropdown works", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/accessibility/org-settings")) {
        if (method === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              default_mode: "offer_choice",
              allowed_accommodations: [
                "extended_time",
                "screen_reader",
                "high_contrast",
                "dyslexia_font",
                "large_text",
                "reduced_motion",
                "keyboard_only",
              ],
              custom_instructions: "",
            }),
          });
        } else if (method === "PUT") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              default_mode: "always_accessible",
              allowed_accommodations: [],
              custom_instructions: "",
            }),
          });
        } else {
          await route.continue();
        }
      } else {
        await route.continue();
      }
    });

    await page.goto("/dashboard/settings");
    await page.getByRole("tab", { name: "Accessibility" }).click();

    await page.getByLabel("Default mode").selectOption("always_accessible");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Accessibility settings saved")).toBeVisible({
      timeout: 5000,
    });
  });
});
