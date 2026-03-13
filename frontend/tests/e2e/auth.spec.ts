import { test, expect } from "@playwright/test";
import {
  API_PATTERN,
  MOCK_TOKEN_RESPONSE,
  setAuthState,
} from "./helpers";

test.describe("Login", () => {
  test("login page renders with email and password fields", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Interview Bot" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(page.getByPlaceholder("••••••••")).toBeVisible();
  });

  test("login form validates required fields", async ({ page }) => {
    await page.goto("/login");

    const signInButton = page.getByRole("button", { name: "Sign In" });
    await signInButton.click();

    const emailInput = page.getByLabel("Email");
    await expect(emailInput).toHaveAttribute("required", "");
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("auth/login") && route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_TOKEN_RESPONSE),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Not mocked" }),
        });
      }
    });

    await page.goto("/login");

    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("Signup", () => {
  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");

    await expect(page.getByRole("heading", { name: "Get Started" })).toBeVisible();
    await expect(page.getByLabel("Company Name")).toBeVisible();
    await expect(page.getByLabel("Full Name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
  });

  test("successful signup redirects to dashboard", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("auth/signup") && route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_TOKEN_RESPONSE),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Not mocked" }),
        });
      }
    });

    await page.goto("/signup");

    await page.getByLabel("Company Name").fill("Acme Corp");
    await page.getByLabel("Full Name").fill("Jane Doe");
    await page.getByLabel("Email").fill("jane@acme.com");
    await page.getByLabel("Password").fill("password1234");
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });
});
