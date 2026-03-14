const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const REQUEST_TIMEOUT_MS = 15000;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status >= 500 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }
  throw lastError ?? new Error("Request failed after retries");
}

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
  const method = (fetchOptions.method ?? "GET").toUpperCase();
  const isGet = method === "GET";
  const fetcher = isGet ? fetchWithRetry : fetch;

  try {
    const res = await fetcher(url, {
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

export interface ScoringRubricDimension {
  dimension: string;
  weight: number;
  description: string;
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
  scoring_rubric?: ScoringRubricDimension[] | null;
  is_active: boolean;
  decision_tree_id?: string | null;
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
  difficulty_progression?: Array<{ question: number; difficulty: string }> | null;
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

export interface ScrapedJob {
  job_id: string;
  job_title: string;
  company_name: string;
  location: string;
  posted_date: string;
  job_url: string;
  snippet: string;
  job_description: string;
}

export interface CopilotSuggestion {
  question: string;
  targets_skill: string;
  rationale: string;
  difficulty: string;
}

export interface LegalAlert {
  question: string;
  is_risky: boolean;
  risk_type?: string;
  severity?: string;
  suggestion?: string;
}

export interface CopilotSession {
  id: string;
  interview_session_id: string;
  user_id: string;
  status: string;
  suggestions: CopilotSuggestion[];
  competency_coverage: Record<string, { covered: boolean; depth: number }>;
  legal_alerts: LegalAlert[];
  started_at: string;
}

export interface OrgUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface DecisionTree {
  id: string;
  name: string;
  description: string | null;
  role_type: string | null;
  tree_data: Record<string, unknown>;
  is_published: boolean;
  usage_count: number;
  created_at: string | null;
}

export interface CompetencyGenome {
  id: string;
  candidate_email: string;
  candidate_name: string | null;
  genome_data: {
    dimensions?: Record<
      string,
      { score: number; confidence?: number; sources?: Array<{ session_id: string; score: number }> }
    >;
    interview_count?: number;
  };
  version: number;
}

export interface RoleGenomeProfile {
  id: string;
  role_type: string;
  title: string;
  ideal_genome: Record<
    string,
    { ideal?: number; min?: number; weight?: number }
  >;
}

export interface Clip {
  id: string;
  session_id: string;
  clip_type: string;
  title: string;
  description: string | null;
  message_start_index: number;
  message_end_index: number;
  transcript_excerpt: string;
  importance_score: number | null;
  tags: string[];
  share_token: string | null;
  created_at: string | null;
}

export interface ClipCollection {
  id: string;
  title: string;
  description: string | null;
  clip_ids: string[];
  share_token: string | null;
  created_at: string | null;
}

export interface ClipCollectionWithClips extends ClipCollection {
  clips: Clip[];
}

export interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  source_data: Record<string, unknown>;
  confidence: number | null;
  tags: string[];
  created_at: string | null;
}

export interface AccessibilityPreferences {
  extended_time: boolean;
  time_multiplier: number;
  screen_reader_optimized: boolean;
  high_contrast: boolean;
  dyslexia_friendly_font: boolean;
  large_text: boolean;
  reduced_motion: boolean;
  keyboard_only_navigation: boolean;
}

export interface AccessibilityConfig {
  mode: string;
  preferences: AccessibilityPreferences;
  accommodations_notes: string;
}

export interface AccessibilityOrgSettings {
  default_mode: string;
  allowed_accommodations: string[];
  custom_instructions: string;
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
  getJobPostings: (page = 1, filters?: { q?: string; is_active?: boolean; role_type?: string; interview_format?: string }) => {
    const params = new URLSearchParams({ page: String(page) });
    if (filters?.q) params.set("q", filters.q);
    if (filters?.is_active !== undefined) params.set("is_active", String(filters.is_active));
    if (filters?.role_type) params.set("role_type", filters.role_type);
    if (filters?.interview_format) params.set("interview_format", filters.interview_format);
    return request<PaginatedResponse<JobPosting>>(`/api/v1/job-postings?${params}`);
  },
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
  generateInterviewLink: (
    id: string,
    data?: {
      candidate_name?: string;
      candidate_email?: string;
      scheduled_at?: string;
    },
  ) =>
    request<{
      token: string;
      interview_url: string;
      ics_content?: string;
      scheduled_at?: string;
    }>(`/api/v1/job-postings/${id}/generate-link`, {
      method: "POST",
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),

  importJobPostings: async (file: File) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const formData = new FormData();
    formData.append("file", file);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(`${API_BASE}/api/v1/job-postings/import`, {
        method: "POST",
        body: formData,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(
          res.status,
          (body as { detail?: string }).detail || "Import failed",
        );
      }
      return res.json() as Promise<{
        total_rows: number;
        created: number;
        errors: number;
        results: { row: number; title?: string; status: string; error?: string }[];
      }>;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  },

  getImportTemplate: () =>
    request<{
      columns: string[];
      sample_row: Record<string, string>;
    }>("/api/v1/job-postings/import/template"),

  extractSkills: (id: string) =>
    request<{
      technical_skills: string[];
      soft_skills: string[];
      experience_level: string;
      suggested_questions: string[];
    }>(`/api/v1/job-postings/${id}/extract-skills`, { method: "POST" }),

  scrapeJobs: (data: { search_terms: string; location?: string; page?: number }) =>
    request<{
      query: string;
      location: string;
      total_results: number;
      jobs: ScrapedJob[];
    }>("/api/v1/job-postings/scrape", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  importScrapedJobs: (data: {
    jobs: ScrapedJob[];
    role_type?: string;
    interview_format?: string;
    interview_config?: Record<string, unknown>;
    auto_extract_skills?: boolean;
  }) =>
    request<{
      total: number;
      created: number;
      errors: number;
      results: Array<{ index: number; title: string; status: string; error?: string; extracted_skills?: string[] }>;
    }>("/api/v1/job-postings/scrape/import", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Decision Trees
  listDecisionTrees: () =>
    request<DecisionTree[]>("/api/v1/decision-trees"),
  createDecisionTree: (data: {
    name: string;
    description?: string;
    role_type?: string;
    tree_data?: Record<string, unknown>;
  }) =>
    request<DecisionTree>("/api/v1/decision-trees", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getDecisionTree: (id: string) =>
    request<DecisionTree>(`/api/v1/decision-trees/${id}`),
  updateDecisionTree: (
    id: string,
    data: {
      name?: string;
      description?: string;
      role_type?: string;
      tree_data?: Record<string, unknown>;
    },
  ) =>
    request<DecisionTree>(`/api/v1/decision-trees/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteDecisionTree: (id: string) =>
    request<void>(`/api/v1/decision-trees/${id}`, { method: "DELETE" }),
  publishDecisionTree: (id: string) =>
    request<DecisionTree>(`/api/v1/decision-trees/${id}/publish`, {
      method: "POST",
    }),
  duplicateDecisionTree: (id: string) =>
    request<DecisionTree>(`/api/v1/decision-trees/${id}/duplicate`, {
      method: "POST",
    }),
  validateDecisionTree: (data: { tree_data: Record<string, unknown> }) =>
    request<{ valid: boolean; errors: string[] }>(
      "/api/v1/decision-trees/validate",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
  getTreeAnalytics: (id: string) =>
    request<{
      paths: Array<{ path: string; count: number; percentage: number }>;
      total_sessions: number;
    }>(`/api/v1/decision-trees/${id}/analytics`),

  // Templates
  getTemplates: () =>
    request<
      Array<{
        id: string;
        name: string;
        description: string | null;
        role_type: string;
        job_description_template: string | null;
        required_skills: string[];
        interview_config: Record<string, unknown>;
        interview_format: string;
        is_system: boolean;
      }>
    >("/api/v1/templates"),
  createTemplate: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>("/api/v1/templates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  createTemplateFromJob: (jobId: string) =>
    request<Record<string, unknown>>(`/api/v1/templates/from-job/${jobId}`, {
      method: "POST",
    }),
  deleteTemplate: (id: string) =>
    request<void>(`/api/v1/templates/${id}`, { method: "DELETE" }),

  // Interviews
  getInterviews: (page = 1, jobId?: string, statusFilter?: string, candidateName?: string, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams({ page: String(page) });
    if (jobId) params.set("job_id", jobId);
    if (statusFilter) params.set("status", statusFilter);
    if (candidateName) params.set("candidate_name", candidateName);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    return request<PaginatedResponse<InterviewSession>>(`/api/v1/interviews?${params}`);
  },
  getInterview: (id: string) =>
    request<InterviewSession>(`/api/v1/interviews/${id}`),
  cancelInterview: (id: string) =>
    request<{ status: string; session_id: string }>(`/api/v1/interviews/${id}/cancel`, { method: "PATCH" }),
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
  getEngagementProfile: (reportId: string) =>
    request<{
      engagement_profile: {
        overall_engagement: number;
        response_speed: {
          avg_ms: number;
          trend: string;
          consistency: number;
          per_question?: { q: number; ms: number }[];
        };
        confidence_pattern: { avg: number; arc: { q: number; v: number }[] };
        elaboration_trend: { avg_depth: number; trend: string };
        notable_signals: { type: string; question_index: number; detail: string }[];
      };
    }>(`/api/v1/reports/${reportId}/engagement`),
  getHighlights: (sessionId: string) =>
    request<{
      highlights: Array<{
        message_index: number;
        type: string;
        label: string;
        summary: string;
        speaker: string;
        timestamp?: string;
        content_preview?: string;
      }>;
      session_id: string;
    }>(`/api/v1/reports/${sessionId}/highlights`),
  shareReport: (sessionId: string, hours?: number) =>
    request<{ share_url: string; share_token: string; expires_at: string }>(
      `/api/v1/reports/${sessionId}/share?hours=${hours ?? 72}`,
      { method: "POST" },
    ),
  getPublicReport: (shareToken: string) =>
    request<CandidateReport>(`/api/v1/reports/public/${shareToken}`),
  exportReportJSON: (sessionId: string) =>
    request<Record<string, unknown>>(
      `/api/v1/reports/${sessionId}/export/json`,
    ),
  exportReportCSV: (sessionId: string) =>
    `/api/v1/reports/${sessionId}/export/csv`,
  // Comments
  getComments: (sessionId: string) =>
    request<
      Array<{
        id: string;
        report_id: string;
        user_id: string;
        user_name: string;
        user_email: string;
        content: string;
        mentioned_user_ids: string[];
        created_at: string;
      }>
    >(`/api/v1/reports/${sessionId}/comments`),
  addComment: (sessionId: string, content: string) =>
    request<{
      id: string;
      report_id: string;
      user_id: string;
      user_name: string;
      user_email: string;
      content: string;
      mentioned_user_ids: string[];
      created_at: string;
    }>(`/api/v1/reports/${sessionId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  deleteComment: (sessionId: string, commentId: string) =>
    request<void>(`/api/v1/reports/${sessionId}/comments/${commentId}`, {
      method: "DELETE",
    }),

  // AI Debrief
  generateDebrief: (sessionIds: string[]) =>
    request<{
      debrief: string;
      candidates: Array<{ name: string; score: number | null }>;
    }>("/api/v1/reports/debrief", {
      method: "POST",
      body: JSON.stringify({ session_ids: sessionIds }),
    }),

  // Clips
  getSessionClips: (sessionId: string) =>
    request<Clip[]>(`/api/v1/clips/session/${sessionId}`),
  generateClips: (sessionId: string) =>
    request<Clip[]>(`/api/v1/clips/generate/${sessionId}`, { method: "POST" }),
  getClip: (clipId: string) =>
    request<Clip>(`/api/v1/clips/${clipId}`),
  deleteClip: (clipId: string) =>
    request<void>(`/api/v1/clips/${clipId}`, { method: "DELETE" }),
  shareClip: (clipId: string, hours?: number) =>
    request<{ share_url: string; share_token: string; expires_at: string }>(
      `/api/v1/clips/${clipId}/share?hours=${hours ?? 72}`,
      { method: "POST" },
    ),
  getPublicClip: (token: string) =>
    request<Clip>(`/api/v1/clips/public/${token}`),
  listClips: (filters?: { type?: string; date_from?: string; date_to?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (filters?.type) params.set("type", filters.type);
    if (filters?.date_from) params.set("date_from", filters.date_from);
    if (filters?.date_to) params.set("date_to", filters.date_to);
    if (filters?.q) params.set("q", filters.q);
    const qs = params.toString();
    return request<Clip[]>(`/api/v1/clips${qs ? `?${qs}` : ""}`);
  },
  createClipCollection: (data: { title: string; description?: string; clip_ids?: string[] }) =>
    request<ClipCollection>(`/api/v1/clip-collections`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listClipCollections: () =>
    request<ClipCollection[]>(`/api/v1/clip-collections`),
  getClipCollection: (id: string) =>
    request<ClipCollectionWithClips>(`/api/v1/clip-collections/${id}`),
  shareClipCollection: (id: string, hours?: number) =>
    request<{ share_url: string; share_token: string; expires_at: string }>(
      `/api/v1/clip-collections/${id}/share?hours=${hours ?? 72}`,
      { method: "POST" },
    ),
  getPublicClipCollection: (token: string) =>
    request<ClipCollectionWithClips>(`/api/v1/clip-collections/public/${token}`),

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

  // Ask AI
  askAI: (query: string, jobId?: string) =>
    request<{
      answer: string;
      citations: Array<{
        session_id: string;
        candidate_name: string | null;
        content_snippet: string;
        source_type: string;
      }>;
      sessions_searched: number;
    }>("/api/v1/ai/ask", {
      method: "POST",
      body: JSON.stringify({ query, job_id: jobId || undefined }),
    }),

  // Candidate Feedback
  submitFeedback: (
    token: string,
    data: {
      overall_rating: number;
      fairness_rating?: number;
      clarity_rating?: number;
      relevance_rating?: number;
      comment?: string;
    },
  ) =>
    request<{ id: string; message: string }>(
      `/api/v1/interviews/public/${token}/feedback`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  getCandidateSatisfaction: (jobId?: string) =>
    request<{
      total_responses: number;
      avg_overall: number | null;
      avg_fairness: number | null;
      avg_clarity: number | null;
      avg_relevance: number | null;
      nps_score: number | null;
      rating_distribution: Record<string, number>;
      recent_comments: Array<{
        comment: string;
        rating: number;
        created_at: string;
      }>;
    }>(
      `/api/v1/analytics/candidate-satisfaction${jobId ? `?job_id=${jobId}` : ""}`,
    ),

  // Analytics
  getAnalyticsOverview: () =>
    request<AnalyticsOverview>("/api/v1/analytics/overview"),
  getAnalyticsPerJob: () =>
    request<JobAnalytics[]>("/api/v1/analytics/per-job"),
  // Skills Insights
  getSkillsInsights: (jobId?: string) =>
    request<{
      total_candidates: number;
      skill_averages: Record<
        string,
        { avg: number; min: number; max: number; count: number; std_dev: number }
      >;
      behavioral_averages: Record<string, { avg: number; count: number }>;
      skill_gaps: Array<{ skill: string; avg: number; count: number }>;
      skill_strengths: Array<{ skill: string; avg: number; count: number }>;
      recommendations: string[];
    }>(`/api/v1/analytics/skills-insights${jobId ? `?job_id=${jobId}` : ""}`),

  // Comparison
  compareCandidates: (jobId: string) =>
    request<
      Array<{
        session_id: string;
        candidate_name: string | null;
        candidate_email: string | null;
        overall_score: number | null;
        duration_seconds: number | null;
        completed_at: string | null;
        is_shortlisted: boolean;
        skill_scores: Record<string, { score: number | null; evidence: string }>;
        behavioral_scores: Record<string, { score: number | null; evidence: string }>;
        recommendation: string | null;
        confidence_score: number | null;
        strengths: string[];
        concerns: string[];
        ai_summary: string | null;
      }>
    >(`/api/v1/analytics/compare?job_id=${jobId}`),
  toggleShortlist: (sessionId: string) =>
    request<{ session_id: string; is_shortlisted: boolean }>(
      `/api/v1/interviews/${sessionId}/shortlist`,
      { method: "PATCH" },
    ),

  // Resume Upload (candidate-facing, optional auth)
  uploadResume: async (token: string, file: File) => {
    const authToken =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/v1/uploads/resume/${token}`, {
      method: "POST",
      body: formData,
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(
        res.status,
        (body as { detail?: string }).detail || "Upload failed",
      );
    }
    return res.json() as Promise<{
      filename: string;
      resume_url: string;
      text_preview: string;
      text_length: number;
    }>;
  },

  // Public Interview
  getPublicInterview: (token: string) =>
    request<Record<string, unknown>>(`/api/v1/interviews/public/${token}`),

  // Coach
  getCoachingReport: (token: string) =>
    request<{
      session_id: string;
      candidate_name: string;
      job_title: string;
      role_type: string;
      duration_seconds: number | null;
      readiness_score: number;
      readiness_label: string;
      summary: string;
      strengths: Array<{
        title: string;
        detail: string;
        question_index: number;
      }>;
      improvements: Array<{
        title: string;
        detail: string;
        tip: string;
        priority: string;
        question_index: number;
      }>;
      question_feedback: Array<{
        question_index: number;
        question_summary: string;
        score: number;
        what_went_well: string;
        what_to_improve: string;
        sample_answer_snippet: string;
      }>;
      study_plan: Array<{
        topic: string;
        reason: string;
        resources: string;
      }>;
      star_method_tips: string[];
    }>(`/api/v1/coach/analyze/${token}`, { method: "POST" }),

  // Practice Mode
  startPractice: (data: {
    template_id?: string;
    role_type?: string;
    candidate_name?: string;
  }) =>
    request<{
      token: string;
      interview_url: string;
      format: string;
      role_type: string;
    }>("/api/v1/practice/start", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getPracticeTemplates: () =>
    request<
      Array<{
        id: string;
        name: string;
        role_type: string;
        description: string;
      }>
    >("/api/v1/practice/templates"),
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

  // Organization / Branding
  getBranding: () =>
    request<{
      logo_url: string;
      primary_color: string;
      company_name: string;
      tagline: string;
    }>("/api/v1/organizations/branding"),
  updateBranding: (data: {
    logo_url: string;
    primary_color: string;
    company_name: string;
    tagline: string;
  }) =>
    request<{ status: string; branding: typeof data }>(
      "/api/v1/organizations/branding",
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    ),

  // Organization / Email
  setupOrgEmail: () =>
    request<{ inbox_id: string; email: string; already_configured: boolean }>(
      "/api/v1/organizations/email/setup",
      { method: "POST" },
    ),
  getEmailStatus: () =>
    request<{ configured: boolean; inbox_id: string | null; email: string | null }>(
      "/api/v1/organizations/email/status",
    ),

  // User Management
  getUsers: () => request<PaginatedResponse<OrgUser>>("/api/v1/users"),
  getOrgMembersForMentions: () =>
    request<
      Array<{ id: string; email: string; full_name: string }>
    >("/api/v1/users/org-members"),
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

  // Walkthrough
  getWalkthrough: () =>
    request<{ completed: Record<string, boolean>; skipped: Record<string, boolean>; version: number }>(
      "/api/v1/users/me/walkthrough",
    ),
  updateWalkthrough: (data: { completed?: Record<string, boolean>; skipped?: Record<string, boolean> }) =>
    request<{ completed: Record<string, boolean>; skipped: Record<string, boolean>; version: number }>(
      "/api/v1/users/me/walkthrough",
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    ),

  // Co-Pilot
  startCopilot: (sessionId: string) =>
    request<CopilotSession>(`/api/v1/copilot/start/${sessionId}`, {
      method: "POST",
    }),
  getCopilot: (copilotId: string) =>
    request<CopilotSession>(`/api/v1/copilot/${copilotId}`),
  getCopilotCoverage: (copilotId: string) =>
    request<{ coverage: Record<string, { covered: boolean; depth: number }> }>(
      `/api/v1/copilot/${copilotId}/coverage`
    ),
  getCopilotSuggestions: (copilotId: string) =>
    request<{
      suggestions: CopilotSuggestion[];
      uncovered_skills: string[];
    }>(`/api/v1/copilot/${copilotId}/suggest`, {
      method: "POST",
    }),
  checkLegalRisk: (copilotId: string, text: string) =>
    request<{
      is_risky: boolean;
      risk_type?: string;
      severity?: string;
      suggestion?: string;
    }>(`/api/v1/copilot/${copilotId}/check-legal`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  endCopilot: (copilotId: string) =>
    request<{ status: string }>(`/api/v1/copilot/${copilotId}/end`, {
      method: "POST",
    }),
  getCopilotHistory: () =>
    request<CopilotSession[]>("/api/v1/copilot/history/list"),

  // Genome
  getGenome: (email: string) =>
    request<CompetencyGenome>(`/api/v1/genome/candidate/${encodeURIComponent(email)}`),
  listGenomes: (q?: string) =>
    request<{ items: CompetencyGenome[]; total: number }>(
      `/api/v1/genome/candidates${q ? `?q=${encodeURIComponent(q)}` : ""}`
    ),
  compareGenomes: (emails: string[]) =>
    request<{
      candidates: Array<{ email: string; name: string | null; genome_data: Record<string, unknown> }>;
    }>("/api/v1/genome/compare", {
      method: "POST",
      body: JSON.stringify({ candidate_emails: emails }),
    }),
  matchGenome: (jobId: string, email: string) =>
    request<{
      job_id: string;
      job_title: string;
      candidate_email: string;
      role_profile: string;
      match_percentage: number;
      gaps: Array<{ dimension: string; actual: number | null; required: number }>;
      overqualified: string[];
    }>(`/api/v1/genome/match/${jobId}`, {
      method: "POST",
      body: JSON.stringify({ candidate_email: email }),
    }),
  listRoleProfiles: () =>
    request<{ items: RoleGenomeProfile[] }>("/api/v1/genome/role-profiles"),
  createRoleProfile: (data: {
    role_type: string;
    title: string;
    ideal_genome?: Record<string, { ideal?: number; min?: number; weight?: number }>;
  }) =>
    request<RoleGenomeProfile>("/api/v1/genome/role-profiles", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteRoleProfile: (id: string) =>
    request<{ status: string }>(`/api/v1/genome/role-profiles/${id}`, {
      method: "DELETE",
    }),
  rebuildGenome: (email: string) =>
    request<CompetencyGenome>(`/api/v1/genome/rebuild/${encodeURIComponent(email)}`, {
      method: "POST",
    }),

  // Knowledge Base
  queryKnowledge: (query: string) =>
    request<{ answer: string; sources: Array<{ id: string; title: string; category: string }>; query_id: string | null }>(
      "/api/v1/knowledge/query",
      {
        method: "POST",
        body: JSON.stringify({ query }),
      }
    ),
  listKnowledgeEntries: (category?: string) => {
    const params = category ? `?category=${encodeURIComponent(category)}` : "";
    return request<{ items: KnowledgeEntry[]; total: number }>(
      `/api/v1/knowledge/entries${params}`
    );
  },
  getKnowledgeEntry: (id: string) =>
    request<KnowledgeEntry>(`/api/v1/knowledge/entries/${id}`),
  generateKnowledge: () =>
    request<{ status: string; entries_created: number }>(
      "/api/v1/knowledge/generate",
      { method: "POST" }
    ),
  getKnowledgeSuggestions: () =>
    request<{
      suggestions: Array<{ title: string; detail: string; type: string }>;
    }>("/api/v1/knowledge/suggestions"),
  rateQuery: (queryId: string, rating: number) =>
    request<{ status: string; rating: number }>(
      `/api/v1/knowledge/query/${queryId}/rate`,
      {
        method: "POST",
        body: JSON.stringify({ rating }),
      }
    ),
  getPopularQueries: () =>
    request<{ queries: Array<{ query: string; count: number }> }>(
      "/api/v1/knowledge/popular-queries"
    ),

  // Company Values / Cultural Fit
  getCompanyValues: () =>
    request<{
      id: string;
      org_id: string;
      values: Array<{
        name: string;
        definition: string;
        weight: number;
        behavioral_indicators: string[];
      }>;
      updated_at: string | null;
    } | null>("/api/v1/values"),
  updateCompanyValues: (values: Array<{
    name: string;
    definition?: string;
    weight?: number;
    behavioral_indicators?: string[];
  }>) =>
    request<{
      id: string;
      org_id: string;
      values: typeof values;
      updated_at: string | null;
    }>("/api/v1/values", {
      method: "PUT",
      body: JSON.stringify({ values }),
    }),
  generateValueQuestions: () =>
    request<{ questions: Record<string, Array<{ question: string; probes?: string[] }>> }>(
      "/api/v1/values/generate-questions",
      { method: "POST" }
    ),
  assessValues: (sessionId: string) =>
    request<{
      id: string;
      session_id: string;
      value_scores: Record<string, { score: number; confidence?: number; evidence?: string[] }>;
      overall_fit_score: number | null;
      fit_label: string | null;
      ai_narrative: string | null;
      created_at: string | null;
    }>("/api/v1/values/assess/" + sessionId, { method: "POST" }),
  getValuesAssessment: (sessionId: string) =>
    request<{
      id: string;
      session_id: string;
      value_scores: Record<string, { score: number; confidence?: number; evidence?: string[] }>;
      overall_fit_score: number | null;
      fit_label: string | null;
      ai_narrative: string | null;
      created_at: string | null;
    }>(`/api/v1/values/assessment/${sessionId}`),
  getValuesTrends: () =>
    request<{
      avg_value_scores: Record<string, number>;
      overall_avg_fit: number | null;
      assessment_count: number;
    }>("/api/v1/values/org-trends"),

  // Training Simulator
  startTraining: (data: { role_type: string; persona?: Record<string, unknown> }) =>
    request<{
      id: string;
      role_type: string;
      candidate_persona: Record<string, unknown>;
      messages: Array<{ role: string; content: string }>;
      status: string;
      started_at: string;
    }>("/api/v1/training/start", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  sendTrainingMessage: (id: string, content: string) =>
    request<{ response: string }>(`/api/v1/training/${id}/message`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  endTraining: (id: string) =>
    request<{
      id: string;
      status: string;
      scorecard: Record<string, unknown>;
      duration_seconds: number | null;
      completed_at: string | null;
    }>(`/api/v1/training/${id}/end`, {
      method: "POST",
    }),
  getTraining: (id: string) =>
    request<{
      id: string;
      role_type: string;
      candidate_persona: Record<string, unknown>;
      messages: Array<{ role: string; content: string }>;
      status: string;
      scorecard: Record<string, unknown> | null;
      duration_seconds: number | null;
      started_at: string | null;
      completed_at: string | null;
    }>(`/api/v1/training/${id}`),
  getTrainingHistory: () =>
    request<
      Array<{
        id: string;
        role_type: string;
        status: string;
        scorecard: { overall?: number } | null;
        duration_seconds: number | null;
        started_at: string | null;
        completed_at: string | null;
      }>
    >("/api/v1/training/history"),
  getTrainingLeaderboard: () =>
    request<
      Array<{
        user_id: string;
        full_name: string;
        email: string;
        avg_score: number;
        simulations_count: number;
      }>
    >("/api/v1/training/leaderboard"),
  getTrainingPersonas: () =>
    request<
      Array<{
        name: string;
        experience_years: number;
        skill_level: string;
        personality: string;
        hidden_strengths: string[];
        hidden_weaknesses: string[];
        background: string;
      }>
    >("/api/v1/training/personas"),
  getRandomPersona: () =>
    request<{
      name: string;
      experience_years: number;
      skill_level: string;
      personality: string;
      hidden_strengths: string[];
      hidden_weaknesses: string[];
      background: string;
    }>("/api/v1/training/personas/random", { method: "POST" }),

  // Predictions / Hiring Success
  recordOutcome: (data: {
    session_id: string;
    candidate_email: string;
    was_hired: boolean;
    hire_date?: string;
  }) =>
    request<{
      id: string;
      session_id: string;
      candidate_email: string;
      was_hired: boolean;
      performance_rating: number | null;
      retention_months: number | null;
      is_still_employed: boolean | null;
      created_at: string | null;
    }>("/api/v1/predictions/outcomes", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateOutcome: (
    sessionId: string,
    data: {
      performance_rating?: number;
      retention_months?: number;
      is_still_employed?: boolean;
      left_reason?: string;
      manager_feedback?: string;
    }
  ) =>
    request<{
      id: string;
      session_id: string;
      candidate_email: string;
      was_hired: boolean;
      performance_rating: number | null;
      retention_months: number | null;
      is_still_employed: boolean | null;
      created_at: string | null;
    }>(`/api/v1/predictions/outcomes/${sessionId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  getOutcomeBySession: (sessionId: string) =>
    request<{
      id: string;
      session_id: string;
      candidate_email: string;
      was_hired: boolean;
      performance_rating: number | null;
      retention_months: number | null;
      is_still_employed: boolean | null;
      created_at: string | null;
    } | null>(`/api/v1/predictions/outcomes/by-session/${sessionId}`),
  listOutcomes: (page?: number, perPage?: number) =>
    request<{
      items: Array<{
        id: string;
        session_id: string;
        candidate_email: string;
        was_hired: boolean;
        performance_rating: number | null;
        retention_months: number | null;
        is_still_employed: boolean | null;
        created_at: string | null;
      }>;
      total: number;
      page: number;
      per_page: number;
    }>(`/api/v1/predictions/outcomes?page=${page ?? 1}&per_page=${perPage ?? 20}`),
  trainModel: () =>
    request<{
      id: string;
      model_version: number;
      training_sample_size: number | null;
      feature_weights: Record<string, number>;
      accuracy_metrics: Record<string, number>;
      is_active: boolean;
      trained_at: string | null;
    }>("/api/v1/predictions/train", { method: "POST" }),
  getPredictionStatus: () =>
    request<{
      model: {
        id: string;
        model_version: number;
        training_sample_size: number | null;
        feature_weights: Record<string, number>;
        accuracy_metrics: Record<string, number>;
        is_active: boolean;
        trained_at: string | null;
      } | null;
      trainable_outcomes: number;
      outcomes_needed: number;
    }>("/api/v1/predictions/status"),
  getModel: () =>
    request<{
      id: string;
      model_version: number;
      training_sample_size: number | null;
      feature_weights: Record<string, number>;
      accuracy_metrics: Record<string, number>;
      is_active: boolean;
      trained_at: string | null;
    } | null>("/api/v1/predictions/model"),
  getPrediction: (sessionId: string) =>
    request<{
      success_probability: number;
      confidence: string;
      contributing_factors: Array<{ factor: string; value?: number; impact: string }>;
      risk_factors: Array<{ factor: string; value?: number; impact: string }>;
      is_heuristic: boolean;
    }>(`/api/v1/predictions/predict/${sessionId}`),
  getInsights: () =>
    request<{
      feature_importance: Array<{ factor: string; weight: number; impact: string }>;
      message?: string;
    }>("/api/v1/predictions/insights"),

  // Accessibility
  getAccessibilityConfig: async (token: string) => {
    const res = await fetch(`${API_BASE}/api/v1/accessibility/config/${token}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, (body as { detail?: string }).detail || "Failed to get config");
    }
    return res.json() as Promise<AccessibilityConfig>;
  },
  updateAccessibilityConfig: async (token: string, config: AccessibilityConfig) => {
    const res = await fetch(`${API_BASE}/api/v1/accessibility/config/${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, (body as { detail?: string }).detail || "Failed to update config");
    }
    return res.json() as Promise<AccessibilityConfig>;
  },
  getAccessibilityCssOverrides: async (token: string) => {
    const res = await fetch(`${API_BASE}/api/v1/accessibility/css-overrides/${token}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, (body as { detail?: string }).detail || "Failed to get overrides");
    }
    return res.json() as Promise<Record<string, string>>;
  },
  getAccessibilityOrgSettings: async () =>
    request<AccessibilityOrgSettings>("/api/v1/accessibility/org-settings"),
  updateAccessibilityOrgSettings: async (settings: AccessibilityOrgSettings) =>
    request<AccessibilityOrgSettings>("/api/v1/accessibility/org-settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

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
