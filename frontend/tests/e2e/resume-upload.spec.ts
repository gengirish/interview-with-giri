import { test, expect } from "@playwright/test";
import { API_PATTERN, MOCK_PUBLIC_INTERVIEW } from "./helpers";

test.describe("Resume Upload", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/interviews/public/") && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PUBLIC_INTERVIEW),
        });
      } else if (url.includes("/uploads/resume/") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            filename: "resume.pdf",
            resume_url: "https://example.com/resume.pdf",
            text_preview: "Sample resume text...",
            text_length: 1500,
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
  });

  test("interview page shows optional resume upload", async ({ page }) => {
    await page.goto("/interview/test-token-123");

    await expect(page.getByText("Resume (optional)")).toBeVisible();
    await expect(
      page.getByText(/Upload your resume to get personalized questions/)
    ).toBeVisible();
    await expect(page.getByText("Choose PDF")).toBeVisible();
  });

  test("resume upload accepts PDF files", async ({ page }) => {
    await page.goto("/interview/test-token-123");

    const fileInput = page.locator('input[type="file"][accept=".pdf"]');
    await expect(fileInput).toBeAttached();

    const pdfContent = "%PDF-1.4 fake pdf content for testing";
    await fileInput.setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfContent),
    });

    await expect(page.getByText("Resume uploaded")).toBeVisible({
      timeout: 5000,
    });
  });

  test("resume upload rejects non-PDF files", async ({ page }) => {
    await page.goto("/interview/test-token-123");

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute("accept", ".pdf");
  });

  test("resume upload shows success state after upload", async ({ page }) => {
    await page.goto("/interview/test-token-123");

    const fileInput = page.locator('input[type="file"][accept=".pdf"]');
    const pdfContent = "%PDF-1.4 minimal pdf";
    await fileInput.setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfContent),
    });

    await expect(page.getByText("Resume uploaded")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Choose PDF")).not.toBeVisible();
  });
});
