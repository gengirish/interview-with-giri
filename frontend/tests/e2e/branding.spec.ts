import { test, expect } from "@playwright/test";
import { API_PATTERN, setAuthState } from "./helpers";

const MOCK_BRANDING = {
  logo_url: "https://example.com/logo.png",
  primary_color: "#FF5722",
  company_name: "Acme Corp",
  tagline: "Hire smarter",
};

const MOCK_SUBSCRIPTION = {
  plan_tier: "professional",
  interviews_limit: 200,
  interviews_used: 42,
  interviews_remaining: 158,
  can_interview: true,
  allowed_formats: ["text", "voice"],
  status: "active",
};

const MOCK_BILLING_PLANS = [
  {
    id: "starter",
    name: "Starter",
    price_monthly: 99,
    interviews_limit: 50,
    max_users: 2,
    allowed_formats: ["text"],
  },
];

const MOCK_WEBHOOKS = { webhooks: [] };

async function setupBrandingMocks(
  page: import("@playwright/test").Page,
  options?: {
    branding?: typeof MOCK_BRANDING;
    emptyBranding?: boolean;
  }
) {
  const branding = options?.emptyBranding
    ? { logo_url: "", primary_color: "#4F46E5", company_name: "", tagline: "" }
    : (options?.branding ?? MOCK_BRANDING);

  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/billing/subscription")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SUBSCRIPTION),
      });
    } else if (url.includes("/billing/plans")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_BILLING_PLANS),
      });
    } else if (url.includes("/webhooks/config")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_WEBHOOKS),
      });
    } else if (url.includes("/organizations/branding")) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(branding),
        });
      } else if (method === "PUT") {
        const body = route.request().postDataJSON?.() ?? branding;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "ok", branding: body }),
        });
      } else {
        await route.continue();
      }
    } else if (url.includes("/organizations/email/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ configured: false, inbox_id: null, email: null }),
      });
    } else if (url.includes("/ats/config")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    }
  });
}

test.describe("White-Label Branding", () => {
  test.beforeEach(async ({ page }) => {
    await setupBrandingMocks(page);
    await setAuthState(page);
  });

  test("branding tab is visible in settings", async ({ page }) => {
    await page.goto("/dashboard/settings");

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
      timeout: 10000,
    });
    const brandingTab = page.getByRole("tab", { name: "Branding" });
    await expect(brandingTab).toBeVisible();
    await brandingTab.click();
    await expect(page.getByText("Custom Branding")).toBeVisible({ timeout: 5000 });
  });

  test("branding form shows company name, color, logo, and tagline fields", async ({
    page,
  }) => {
    await page.goto("/dashboard/settings");

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
      timeout: 10000,
    });
    const brandingTab = page.getByRole("tab", { name: "Branding" });
    await brandingTab.click();

    await expect(page.getByLabel("Company Name")).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel("Tagline")).toBeVisible();
    await expect(page.getByLabel("Primary Color")).toBeVisible();
    await expect(page.getByLabel("Logo URL")).toBeVisible();
  });

  test("save branding button saves and shows success toast", async ({ page }) => {
    await page.goto("/dashboard/settings");

    const brandingTab = page.getByRole("tab", { name: "Branding" });
    await brandingTab.click();

    await expect(page.getByLabel("Company Name")).toBeVisible({ timeout: 5000 });
    await page.getByLabel("Company Name").fill("Test Company");
    await page.getByRole("button", { name: "Save Branding" }).click();

    await expect(page.getByText("Branding saved successfully")).toBeVisible({
      timeout: 5000,
    });
  });

  test("branding tab loads existing branding data", async ({ page }) => {
    await page.goto("/dashboard/settings");

    const brandingTab = page.getByRole("tab", { name: "Branding" });
    await brandingTab.click();

    await expect(page.getByLabel("Company Name")).toHaveValue("Acme Corp", {
      timeout: 5000,
    });
    await expect(page.getByLabel("Tagline")).toHaveValue("Hire smarter");
    await expect(page.getByLabel("Logo URL")).toHaveValue("https://example.com/logo.png");
  });

  test("interview page applies custom branding colors and company name", async ({
    page,
  }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/interviews/public/") && route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "pending",
            job_title: "Senior Engineer",
            job_description: "Looking for a senior engineer.",
            format: "text",
            interview_config: { num_questions: 10, duration_minutes: 30, include_coding: false },
            branding: MOCK_BRANDING,
          }),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Not mocked" }),
        });
      }
    });

    await page.goto("/interview/test-token-branding");

    await expect(page.getByRole("heading", { name: "Acme Corp" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Hire smarter")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Senior Engineer" })).toBeVisible();
  });
});
