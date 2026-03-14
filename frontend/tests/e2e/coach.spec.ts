import { test, expect } from "@playwright/test";

test.describe("Coach Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/coach");
  });

  test("shows hero section with coaching branding", async ({ page }) => {
    await expect(page.getByText("AI Interview Coach")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ace Your Next Interview" })
    ).toBeVisible();
    await expect(
      page.getByText("Practice with our AI interviewer")
    ).toBeVisible();
  });

  test("shows how-it-works steps", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "How It Works" })
    ).toBeVisible();
    await expect(
      page.getByText("Take a Practice Interview")
    ).toBeVisible();
    await expect(
      page.getByText("Get Your Coaching Report")
    ).toBeVisible();
    await expect(
      page.getByText("Improve and Repeat")
    ).toBeVisible();
  });

  test("shows what-report-includes section", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "What Your Report Includes" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Readiness Score" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Question-by-Question Feedback" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Prioritized Improvements" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Personalized Study Plan" })
    ).toBeVisible();
  });

  test("shows sample coaching report preview", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Sample Coaching Report" })
    ).toBeVisible();
    await expect(page.getByText("78")).toBeVisible();
    await expect(page.getByText("5/5")).toBeVisible();
    await expect(
      page.getByText("Clear Problem Decomposition")
    ).toBeVisible();
    await expect(page.getByText("Add Metrics to Answers")).toBeVisible();
  });

  test("start practice button navigates to /practice", async ({ page }) => {
    await page
      .getByRole("button", { name: "Start Practice Interview" })
      .click();
    await expect(page).toHaveURL(/\/practice/);
  });

  test("view existing report shows token input", async ({ page }) => {
    await page
      .getByRole("button", { name: "View Existing Report" })
      .click();
    await expect(
      page.getByPlaceholder("Enter your interview token")
    ).toBeVisible();
  });

  test("bottom CTA links to practice page", async ({ page }) => {
    await page
      .getByRole("button", { name: "Start Your Free Practice Now" })
      .click();
    await expect(page).toHaveURL(/\/practice/);
  });
});

test.describe("Practice Completion with Coaching", () => {
  test("shows coaching report button after practice completion", async ({
    page,
  }) => {
    // Mock the interview page as completed practice
    await page.route("**/api/v1/interviews/public/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-session-id",
          token: "test-token",
          status: "completed",
          format: "text",
          job_title: "Practice: Software Engineer",
          job_description: "Practice interview",
          interview_config: { num_questions: 5 },
          is_practice: true,
        }),
      })
    );

    await page.goto("/interview/test-token");

    await expect(
      page.getByRole("heading", { name: "Practice Complete!" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Get AI Coaching Report/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Practice Again" })
    ).toBeVisible();
  });

  test("clicking coaching report button shows loading state", async ({
    page,
  }) => {
    await page.route("**/api/v1/interviews/public/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-session-id",
          token: "test-token",
          status: "completed",
          format: "text",
          job_title: "Practice: Software Engineer",
          job_description: "Practice interview",
          interview_config: { num_questions: 5 },
          is_practice: true,
        }),
      })
    );

    // Delay the coaching API response to test loading state
    await page.route("**/api/v1/coach/analyze/**", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: "test-session-id",
          candidate_name: "Test User",
          job_title: "Practice: Software Engineer",
          role_type: "technical",
          duration_seconds: 300,
          readiness_score: 78,
          readiness_label: "Ready",
          summary: "Good performance with strong fundamentals.",
          strengths: [
            {
              title: "Clear Communication",
              detail: "Explained concepts well.",
              question_index: 0,
            },
          ],
          improvements: [
            {
              title: "Add Examples",
              detail: "Use specific examples.",
              tip: "Reference real projects.",
              priority: "high",
              question_index: 1,
            },
          ],
          question_feedback: [
            {
              question_index: 0,
              question_summary: "Python experience",
              score: 8,
              what_went_well: "Good depth on frameworks.",
              what_to_improve: "Mention specific projects.",
              sample_answer_snippet:
                "I built a REST API handling 10K req/s...",
            },
          ],
          study_plan: [
            {
              topic: "System Design",
              reason: "Not covered in depth.",
              resources: "Practice designing a chat system.",
            },
          ],
          star_method_tips: ["Use STAR format for behavioral answers."],
        }),
      });
    });

    await page.goto("/interview/test-token");

    await page
      .getByRole("button", { name: /Get AI Coaching Report/i })
      .click();

    await expect(
      page.getByText("Analyzing Your Performance...")
    ).toBeVisible();
  });

  test("displays full coaching report after generation", async ({ page }) => {
    await page.route("**/api/v1/interviews/public/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-session-id",
          token: "test-token",
          status: "completed",
          format: "text",
          job_title: "Practice: Software Engineer",
          job_description: "Practice interview",
          interview_config: { num_questions: 5 },
          is_practice: true,
        }),
      })
    );

    await page.route("**/api/v1/coach/analyze/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: "test-session-id",
          candidate_name: "Test User",
          job_title: "Practice: Software Engineer",
          role_type: "technical",
          duration_seconds: 300,
          readiness_score: 78,
          readiness_label: "Ready",
          summary: "Strong candidate with solid fundamentals.",
          strengths: [
            {
              title: "Clear Communication",
              detail: "Explained concepts very well.",
              question_index: 0,
            },
          ],
          improvements: [
            {
              title: "Add Metrics",
              detail: "Quantify your achievements.",
              tip: "Use numbers like percentages and timelines.",
              priority: "high",
              question_index: 1,
            },
          ],
          question_feedback: [
            {
              question_index: 0,
              question_summary: "Tell me about Python experience",
              score: 8,
              what_went_well: "Great depth on FastAPI.",
              what_to_improve: "Mention testing practices.",
              sample_answer_snippet:
                "I built a FastAPI service processing 10K requests/second with 99.9% uptime.",
            },
          ],
          study_plan: [
            {
              topic: "System Design",
              reason: "Limited coverage during interview.",
              resources: "Practice designing a URL shortener.",
            },
          ],
          star_method_tips: [
            "Structure behavioral answers: Situation, Task, Action, Result.",
          ],
        }),
      })
    );

    await page.goto("/interview/test-token");
    await page
      .getByRole("button", { name: /Get AI Coaching Report/i })
      .click();

    // Readiness score
    await expect(page.getByText("Interview Readiness")).toBeVisible();
    await expect(page.getByText("78")).toBeVisible();
    await expect(page.getByText("Ready")).toBeVisible();

    // Summary
    await expect(
      page.getByText("Strong candidate with solid fundamentals.")
    ).toBeVisible();

    // Question feedback
    await expect(
      page.getByText("Question-by-Question Feedback")
    ).toBeVisible();
    await expect(
      page.getByText("Tell me about Python experience")
    ).toBeVisible();

    // Strengths
    await expect(page.getByText("Your Strengths")).toBeVisible();
    await expect(page.getByText("Clear Communication")).toBeVisible();

    // Improvements
    await expect(page.getByText("Areas to Improve")).toBeVisible();
    await expect(page.getByText("Add Metrics")).toBeVisible();
    await expect(page.getByText("high")).toBeVisible();

    // Study plan
    await expect(
      page.getByText("Personalized Study Plan")
    ).toBeVisible();
    await expect(page.getByText("System Design")).toBeVisible();

    // STAR tips
    await expect(page.getByText("STAR Method Tips")).toBeVisible();

    // Action buttons
    await expect(
      page.getByRole("button", { name: "Practice Again" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create Free Account" })
    ).toBeVisible();
  });
});
