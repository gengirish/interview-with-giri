import { test, expect } from "@playwright/test";
import {
  API_PATTERN,
  setAuthState,
} from "./helpers";

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

function setupSettingsMocks(
  page: import("@playwright/test").Page,
  emailStatus?: object,
  emailSetupResponse?: object,
) {
  return page.route(API_PATTERN, async (route) => {
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
    } else if (
      url.includes("/organizations/email/status") &&
      method === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          emailStatus ?? {
            configured: false,
            inbox_id: null,
            email: null,
          },
        ),
      });
    } else if (
      url.includes("/organizations/email/setup") &&
      method === "POST"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          emailSetupResponse ?? {
            inbox_id: "inbox_new_123",
            email: "interviews-org12345@intelliforge.tech",
            already_configured: false,
          },
        ),
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

test.describe("Settings - Email Tab", () => {
  test.beforeEach(async ({ page }) => {
    await setAuthState(page);
  });

  test("email tab shows unconfigured state and setup button", async ({
    page,
  }) => {
    await setupSettingsMocks(page);
    await page.goto("/dashboard/settings");

    const emailTab = page.getByRole("tab", { name: "Email" });
    await expect(emailTab).toBeVisible();
    await emailTab.click();

    await expect(
      page.getByText("Email Delivery (AgentMail)"),
    ).toBeVisible();
    await expect(
      page.getByText("No email inbox configured yet"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Set Up Email Inbox" }),
    ).toBeVisible();
  });

  test("email tab shows configured state with active inbox", async ({
    page,
  }) => {
    await setupSettingsMocks(page, {
      configured: true,
      inbox_id: "inbox_abc123",
      email: "interviews-org12345@intelliforge.tech",
    });
    await page.goto("/dashboard/settings");

    const emailTab = page.getByRole("tab", { name: "Email" });
    await emailTab.click();

    await expect(page.getByText("Email inbox active")).toBeVisible();
    await expect(
      page.getByText("interviews-org12345@intelliforge.tech"),
    ).toBeVisible();
    await expect(
      page.getByText("Interview invitation links"),
    ).toBeVisible();
    await expect(
      page.getByText("Interview completion notifications"),
    ).toBeVisible();
  });

  test("clicking setup button creates inbox and shows success", async ({
    page,
  }) => {
    let emailStatusCalls = 0;
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
      } else if (
        url.includes("/organizations/email/status") &&
        method === "GET"
      ) {
        emailStatusCalls++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            configured: false,
            inbox_id: null,
            email: null,
          }),
        });
      } else if (
        url.includes("/organizations/email/setup") &&
        method === "POST"
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            inbox_id: "inbox_new_456",
            email: "interviews-org12345@intelliforge.tech",
            already_configured: false,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
      }
    });

    await page.goto("/dashboard/settings");

    const emailTab = page.getByRole("tab", { name: "Email" });
    await emailTab.click();

    await expect(
      page.getByRole("button", { name: "Set Up Email Inbox" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Set Up Email Inbox" }).click();

    await expect(page.getByText("Email inbox active")).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByText("interviews-org12345@intelliforge.tech"),
    ).toBeVisible();
  });

  test("email setup shows error toast on failure", async ({ page }) => {
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
      } else if (url.includes("/organizations/email/status")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            configured: false,
            inbox_id: null,
            email: null,
          }),
        });
      } else if (
        url.includes("/organizations/email/setup") &&
        method === "POST"
      ) {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            detail: "Failed to create email inbox — check AGENTMAIL_API_KEY",
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
      }
    });

    await page.goto("/dashboard/settings");

    const emailTab = page.getByRole("tab", { name: "Email" });
    await emailTab.click();

    await page.getByRole("button", { name: "Set Up Email Inbox" }).click();

    await expect(
      page.getByText(/Failed to create email inbox/),
    ).toBeVisible({ timeout: 5000 });
  });

  test("email tab is accessible from all settings tabs", async ({
    page,
  }) => {
    await setupSettingsMocks(page);
    await page.goto("/dashboard/settings");

    const billingTab = page.getByRole("tab", { name: "Billing" });
    const emailTab = page.getByRole("tab", { name: "Email" });
    const webhooksTab = page.getByRole("tab", { name: "Webhooks" });
    const notificationsTab = page.getByRole("tab", {
      name: "Notifications",
    });

    await expect(billingTab).toBeVisible();
    await expect(emailTab).toBeVisible();
    await expect(webhooksTab).toBeVisible();
    await expect(notificationsTab).toBeVisible();

    await emailTab.click();
    await expect(
      page.getByText("Email Delivery (AgentMail)"),
    ).toBeVisible();

    await webhooksTab.click();
    await expect(page.getByText("Webhook Configuration")).toBeVisible();

    await emailTab.click();
    await expect(
      page.getByText("Email Delivery (AgentMail)"),
    ).toBeVisible();
  });

  test("already configured inbox shows already_configured message", async ({
    page,
  }) => {
    await setupSettingsMocks(
      page,
      {
        configured: true,
        inbox_id: "inbox_existing",
        email: "hire-with-giri@intelliforge.tech",
      },
    );
    await page.goto("/dashboard/settings");

    const emailTab = page.getByRole("tab", { name: "Email" });
    await emailTab.click();

    await expect(page.getByText("Email inbox active")).toBeVisible();
    await expect(
      page.getByText("hire-with-giri@intelliforge.tech"),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Set Up Email Inbox" }),
    ).not.toBeVisible();
  });
});
