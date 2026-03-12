const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const REQUEST_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type RequestOptions = RequestInit & { skipAuthRedirect?: boolean };

async function fetchWithTimeout(
  url: string,
  options: RequestOptions & { token: string | null },
): Promise<Response> {
  const { skipAuthRedirect, token, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(fetchOptions.headers as Record<string, string>),
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (
      res.status === 401 &&
      token &&
      !skipAuthRedirect &&
      typeof window !== "undefined"
    ) {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("org_id");
      window.location.href = "/login";
      throw new ApiError(401, "Unauthorized");
    }

    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(0, "Request timed out");
    }
    throw err;
  }
}

async function request<T>(
  path: string,
  options?: RequestOptions,
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    ...options,
    token,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || "Request failed");
  }
  return res.json();
}

// --- Types ---

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  role: string;
  org_id: string;
}

export interface JobPosting {
  id: string;
  org_id: string;
  title: string;
  role_type: string;
  job_description: string;
  required_skills: string[];
  interview_format: string;
  interview_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  interview_link?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface InterviewSession {
  id: string;
  job_posting_id: string;
  token: string;
  candidate_name: string | null;
  candidate_email: string | null;
  status: string;
  format: string;
  overall_score: number | null;
  duration_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface DashboardStats {
  total_interviews: number;
  completed_interviews: number;
  active_jobs: number;
  avg_score: number | null;
  interviews_this_month: number;
  pass_rate: number | null;
}

export interface InterviewMessage {
  id: string;
  role: string;
  content: string;
  media_url: string | null;
  created_at: string;
}

export interface CandidateReport {
  id: string;
  session_id: string;
  candidate_name: string | null;
  overall_score: number | null;
  skill_scores: Record<string, { score: number | null; evidence: string; notes?: string }>;
  behavioral_scores: Record<string, { score: number | null; evidence: string; notes?: string }>;
  ai_summary: string | null;
  strengths: string[];
  concerns: string[];
  recommendation: string | null;
  confidence_score: number | null;
  summary?: string;
  suggested_follow_up_areas?: string[];
  hiring_level_fit?: string;
  created_at: string;
}

export interface AnalyticsOverview {
  total_interviews: number;
  completed_interviews: number;
  completion_rate: number;
  avg_score: number | null;
  avg_duration_minutes: number | null;
  score_distribution: Record<string, number>;
  status_breakdown: Record<string, number>;
  format_breakdown: Record<string, number>;
}

export interface JobAnalytics {
  job_id: string;
  title: string;
  role_type: string;
  is_active: boolean;
  total_interviews: number;
  completed_interviews: number;
  avg_score: number | null;
  avg_duration_minutes: number | null;
}

export interface SubscriptionInfo {
  plan_tier: string;
  interviews_limit: number;
  interviews_used: number;
  interviews_remaining: number;
  can_interview: boolean;
  allowed_formats: string[];
  status: string;
}

export interface BillingPlan {
  id: string;
  name: string;
  price_monthly: number;
  interviews_limit: number;
  max_users: number;
  allowed_formats: string[];
}

export interface WebhookConfig {
  url: string;
  events: string[];
  secret: string;
}

export interface BehaviorEvent {
  event_type:
    | "keystroke"
    | "paste"
    | "tab_switch"
    | "focus_loss"
    | "idle"
    | "code_submit";
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  compile_output: string;
  status: string;
  time: string | null;
  memory: number | null;
  exit_code: number | null;
}

export interface OrgUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

// --- API Client ---

export const api = {
  health: () => request<{ status: string }>("/api/v1/health"),

  // Auth
  login: (email: string, password: string) =>
    request<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signup: (data: {
    org_name: string;
    full_name: string;
    email: string;
    password: string;
  }) =>
    request<TokenResponse>("/api/v1/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Job Postings
  getJobPostings: (page = 1) =>
    request<PaginatedResponse<JobPosting>>(
      `/api/v1/job-postings?page=${page}`,
    ),
  getJobPosting: (id: string) =>
    request<JobPosting>(`/api/v1/job-postings/${id}`),
  createJobPosting: (data: Record<string, unknown>) =>
    request<JobPosting>("/api/v1/job-postings", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateJobPosting: (id: string, data: Record<string, unknown>) =>
    request<JobPosting>(`/api/v1/job-postings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteJobPosting: (id: string) =>
    request<void>(`/api/v1/job-postings/${id}`, { method: "DELETE" }),
  generateInterviewLink: (id: string) =>
    request<{ token: string; interview_url: string }>(
      `/api/v1/job-postings/${id}/generate-link`,
      { method: "POST" },
    ),

  extractSkills: (id: string) =>
    request<{
      technical_skills: string[];
      soft_skills: string[];
      experience_level: string;
      suggested_questions: string[];
    }>(`/api/v1/job-postings/${id}/extract-skills`, { method: "POST" }),

  // Interviews
  getInterviews: (page = 1, jobId?: string, status?: string) => {
    const params = new URLSearchParams({ page: String(page) });
    if (jobId) params.set("job_id", jobId);
    if (status) params.set("status", status);
    return request<PaginatedResponse<InterviewSession>>(
      `/api/v1/interviews?${params}`,
    );
  },
  getInterview: (id: string) =>
    request<InterviewSession>(`/api/v1/interviews/${id}`),
  getInterviewMessages: (id: string) =>
    request<InterviewMessage[]>(`/api/v1/interviews/${id}/messages`),

  // Dashboard
  getDashboardStats: () =>
    request<DashboardStats>("/api/v1/dashboard/stats"),

  // Reports
  generateReport: (sessionId: string) =>
    request<CandidateReport>(`/api/v1/reports/${sessionId}/generate`, {
      method: "POST",
    }),
  getReport: (sessionId: string) =>
    request<CandidateReport>(`/api/v1/reports/${sessionId}`),
  exportReportJSON: (sessionId: string) =>
    request<Record<string, unknown>>(
      `/api/v1/reports/${sessionId}/export/json`,
    ),
  exportReportCSV: (sessionId: string) =>
    `/api/v1/reports/${sessionId}/export/csv`,
  exportReportCSVBlob: async (sessionId: string): Promise<Blob> => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const res = await fetchWithTimeout(
      `${API_BASE}/api/v1/reports/${sessionId}/export/csv`,
      { token },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(
        res.status,
        (body as { detail?: string }).detail || "Failed to export CSV",
      );
    }
    return res.blob();
  },

  // ATS Integration
  getATSConfigs: () =>
    request<{ platform: string; enabled: boolean }[]>("/api/v1/ats/config"),
  saveATSConfig: (config: {
    platform: string;
    api_key: string;
    enabled?: boolean;
    subdomain?: string;
  }) =>
    request<{ status: string }>("/api/v1/ats/config", {
      method: "POST",
      body: JSON.stringify(config),
    }),
  deleteATSConfig: (platform: string) =>
    request<{ status: string }>(`/api/v1/ats/config/${platform}`, {
      method: "DELETE",
    }),

  // Analytics
  getAnalyticsOverview: () =>
    request<AnalyticsOverview>("/api/v1/analytics/overview"),
  getAnalyticsPerJob: () =>
    request<JobAnalytics[]>("/api/v1/analytics/per-job"),

  // Public Interview
  getPublicInterview: (token: string) =>
    request<Record<string, unknown>>(`/api/v1/interviews/public/${token}`),
  startInterview: (
    token: string,
    data: { candidate_name: string; candidate_email: string },
  ) =>
    request<Record<string, unknown>>(
      `/api/v1/interviews/public/${token}/start`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),

  // Billing
  getSubscription: () =>
    request<SubscriptionInfo>("/api/v1/billing/subscription"),
  getBillingPlans: () => request<BillingPlan[]>("/api/v1/billing/plans"),
  createCheckout: (planId: string, successUrl?: string, cancelUrl?: string) =>
    request<{ url: string }>("/api/v1/billing/checkout", {
      method: "POST",
      body: JSON.stringify({
        plan_id: planId,
        ...(successUrl && { success_url: successUrl }),
        ...(cancelUrl && { cancel_url: cancelUrl }),
      }),
    }),

  // Webhooks
  getWebhookConfig: () =>
    request<{ webhooks: WebhookConfig[] }>("/api/v1/webhooks/config"),
  addWebhookConfig: (config: WebhookConfig) =>
    request<{ status: string; webhooks: WebhookConfig[] }>(
      "/api/v1/webhooks/config",
      {
        method: "POST",
        body: JSON.stringify(config),
      },
    ),

  // User Management
  getUsers: () => request<OrgUser[]>("/api/v1/users"),
  getCurrentUser: () => request<OrgUser>("/api/v1/users/me"),
  inviteUser: (data: {
    email: string;
    full_name: string;
    role: string;
    password: string;
  }) =>
    request<OrgUser>("/api/v1/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateUserRole: (userId: string, role: string) =>
    request<OrgUser>(`/api/v1/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  toggleUserActive: (userId: string) =>
    request<OrgUser>(`/api/v1/users/${userId}/deactivate`, {
      method: "PATCH",
    }),

  // Proctoring / Integrity
  getBehaviorSummary: (sessionId: string) =>
    request<import("@/types").BehaviorSummary>(
      `/api/v1/proctoring/summary/${sessionId}`,
    ),
  getIntegrityAssessment: (sessionId: string) =>
    request<import("@/types").IntegrityAssessment>(
      `/api/v1/proctoring/integrity/${sessionId}`,
    ),
  submitBehaviorEvents: (token: string, events: BehaviorEvent[]) =>
    request<{ status: string; count: number }>(
      `/api/v1/proctoring/events/${token}/batch`,
      {
        method: "POST",
        body: JSON.stringify(events),
      },
    ),

  // Code Execution
  executeCode: (
    sourceCode: string,
    language: string,
    interviewToken: string,
    stdin = "",
  ) =>
    request<CodeExecutionResult>("/api/v1/code/execute", {
      method: "POST",
      body: JSON.stringify({
        source_code: sourceCode,
        language,
        interview_token: interviewToken,
        stdin,
      }),
    }),
};
