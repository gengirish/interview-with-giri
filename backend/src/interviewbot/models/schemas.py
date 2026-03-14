from __future__ import annotations

from datetime import datetime
from enum import StrEnum
import ipaddress
from urllib.parse import urlparse
from uuid import UUID
import warnings

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# --- Enums ---


class InterviewFormat(StrEnum):
    TEXT = "text"
    VOICE = "voice"
    VIDEO = "video"


class RoleType(StrEnum):
    TECHNICAL = "technical"
    NON_TECHNICAL = "non_technical"
    MIXED = "mixed"


class UserRole(StrEnum):
    ADMIN = "admin"
    HIRING_MANAGER = "hiring_manager"
    VIEWER = "viewer"


class SessionStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    EXPIRED = "expired"
    DISCONNECTED = "disconnected"


class Recommendation(StrEnum):
    STRONG_HIRE = "strong_hire"
    HIRE = "hire"
    NO_HIRE = "no_hire"


# --- Auth ---


class SignupRequest(BaseModel):
    org_name: str = Field(..., min_length=2, max_length=255)
    full_name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    role: str
    org_id: UUID


# --- Organizations ---


class OrganizationResponse(BaseModel):
    id: UUID
    name: str
    domain: str | None
    is_active: bool
    created_at: datetime


# --- Job Postings ---


class InterviewConfig(BaseModel):
    num_questions: int = Field(10, ge=3, le=30)
    duration_minutes: int = Field(30, ge=10, le=120)
    difficulty: str = Field("medium")
    include_coding: bool = False
    language: str = Field("en", description="Interview language code (e.g. en, es, fr, hi, zh)")


class JobPostingCreateRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    role_type: RoleType
    job_description: str = Field(..., min_length=50)
    required_skills: list[str] = Field(default_factory=list)
    interview_format: InterviewFormat = InterviewFormat.TEXT
    interview_config: InterviewConfig = Field(default_factory=InterviewConfig)
    scoring_rubric: list[dict] | None = Field(
        None, description="Custom scoring dimensions with weights"
    )
    decision_tree_id: UUID | None = Field(
        None, description="Optional decision tree for dynamic branching"
    )


class JobPostingUpdateRequest(BaseModel):
    title: str | None = None
    job_description: str | None = None
    required_skills: list[str] | None = None
    interview_format: InterviewFormat | None = None
    interview_config: InterviewConfig | None = None
    scoring_rubric: list[dict] | None = None
    is_active: bool | None = None


class JobPostingResponse(BaseModel):
    id: UUID
    org_id: UUID
    title: str
    role_type: RoleType
    job_description: str
    required_skills: list[str]
    interview_format: InterviewFormat
    interview_config: dict
    scoring_rubric: list[dict] | None = None
    is_active: bool
    created_at: datetime
    interview_link: str | None = None


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    per_page: int


# --- Interviews ---


class InterviewStartRequest(BaseModel):
    candidate_name: str = Field(..., min_length=2, max_length=255)
    candidate_email: EmailStr


class InterviewSessionResponse(BaseModel):
    id: UUID
    job_posting_id: UUID
    token: str
    candidate_name: str | None
    candidate_email: str | None
    status: SessionStatus
    format: InterviewFormat
    overall_score: float | None
    duration_seconds: int | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    difficulty_progression: list[dict] | None = None


class InterviewMessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    media_url: str | None
    created_at: datetime


# --- Reports ---


class EngagementMetrics(BaseModel):
    response_latency_ms: int | None = None
    word_count: int = 0
    words_per_minute: float = 0
    hedging_score: float = 0
    assertiveness_score: float = 0
    elaboration_depth: int = 0
    question_engagement: float = 0


class EngagementSignal(BaseModel):
    type: str
    question_index: int
    detail: str


class EngagementProfile(BaseModel):
    overall_engagement: float = 0
    response_speed: dict = {}
    confidence_pattern: dict = {}
    elaboration_trend: dict = {}
    notable_signals: list[dict] = []


class DimensionalScore(BaseModel):
    score: float | None = None
    evidence: str = ""
    notes: str = ""


class SWEScorecard(BaseModel):
    technical_scores: dict[str, DimensionalScore] = Field(default_factory=dict)
    behavioral_scores: dict[str, DimensionalScore] = Field(default_factory=dict)
    overall_score: float = 0.0
    confidence_score: float = 0.0
    experience_level_assessment: str = ""
    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    recommendation: str = ""
    suggested_follow_up_areas: list[str] = Field(default_factory=list)
    hiring_level_fit: str = ""


class SkillScore(BaseModel):
    """Legacy format; use DimensionalScore for new reports."""

    score: float = Field(..., ge=0.0, le=10.0)
    evidence: str


class BehavioralScore(BaseModel):
    """Legacy format; use DimensionalScore for new reports."""

    score: float = Field(..., ge=0.0, le=10.0)
    evidence: str


class CandidateReportResponse(BaseModel):
    id: UUID
    session_id: UUID
    candidate_name: str | None = None
    overall_score: float | None
    skill_scores: dict[str, DimensionalScore]
    behavioral_scores: dict[str, DimensionalScore]
    ai_summary: str | None
    strengths: list[str]
    concerns: list[str]
    recommendation: Recommendation | None
    confidence_score: float | None
    experience_level_assessment: str | None = None
    suggested_follow_up_areas: list[str] = Field(default_factory=list)
    hiring_level_fit: str | None = None
    created_at: datetime


# --- Billing ---


class SubscriptionResponse(BaseModel):
    plan_tier: str
    interviews_limit: int
    interviews_used: int
    interviews_remaining: int
    can_interview: bool
    allowed_formats: list[str]
    status: str


class PlanResponse(BaseModel):
    id: str
    name: str
    price_monthly: float
    interviews_limit: int
    max_users: int
    allowed_formats: list[str]


def _is_private_or_localhost(host: str) -> bool:
    """Check if host is private IP, localhost, or 0.0.0.0."""
    if not host:
        return True
    host_lower = host.lower().strip()
    if host_lower in ("localhost", "0.0.0.0", "::1"):
        return True
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False


class CheckoutRequest(BaseModel):
    plan_id: str
    success_url: str = "http://localhost:3000/settings?billing=success"
    cancel_url: str = "http://localhost:3000/settings?billing=cancelled"

    @field_validator("success_url", "cancel_url")
    @classmethod
    def validate_redirect_url(cls, v: str) -> str:
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("URL must use http or https scheme")
        if parsed.scheme == "http" and parsed.hostname != "localhost":
            raise ValueError("Only https:// or http://localhost allowed for redirect URLs")
        if "@" in (parsed.netloc or ""):
            raise ValueError("URL must not contain user-info (e.g. user:pass@host)")
        domain = parsed.hostname or ""
        if (
            domain
            and not _is_private_or_localhost(domain)
            and not any(
                p in domain for p in (".com", ".io", ".co", ".org", ".net", ".app", "localhost")
            )
        ):
            warnings.warn(
                f"Redirect URL domain '{domain}' does not match expected patterns",
                UserWarning,
                stacklevel=2,
            )
        return v


class CheckoutResponse(BaseModel):
    url: str


# --- Dashboard ---


class DashboardStats(BaseModel):
    total_interviews: int
    completed_interviews: int
    active_jobs: int
    avg_score: float | None
    interviews_this_month: int
    pass_rate: float | None


class AnalyticsOverviewResponse(BaseModel):
    total_interviews: int
    completed_interviews: int
    completion_rate: float
    avg_score: float | None
    avg_duration_minutes: float | None
    score_distribution: dict[str, int]
    status_breakdown: dict[str, int]
    format_breakdown: dict[str, int]


class JobAnalyticsResponse(BaseModel):
    job_id: str
    title: str
    role_type: str
    is_active: bool
    total_interviews: int
    completed_interviews: int
    avg_score: float | None
    avg_duration_minutes: float | None


class BrandingInfo(BaseModel):
    logo_url: str = ""
    primary_color: str = "#4F46E5"
    company_name: str = ""
    tagline: str = ""


class PublicInterviewInfoResponse(BaseModel):
    token: str
    status: str
    format: str
    job_title: str
    job_description: str
    interview_config: dict
    branding: BrandingInfo = Field(default_factory=BrandingInfo)
    is_practice: bool = False


class InterviewStartResponse(BaseModel):
    token: str
    status: str
    message: str


class WebhookConfig(BaseModel):
    url: str = Field(..., min_length=10)
    events: list[str] = Field(default_factory=lambda: ["interview.completed", "interview.scored"])
    secret: str = Field("", description="HMAC secret for signature verification")

    @field_validator("url")
    @classmethod
    def validate_webhook_url(cls, v: str) -> str:
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("Webhook URL must use http or https scheme only")
        host = (parsed.hostname or "").strip()
        if not host:
            raise ValueError("Webhook URL must have a valid host")
        if _is_private_or_localhost(host):
            raise ValueError("Webhook URL must not point to private/internal IPs or localhost")
        return v


class WebhookConfigItem(BaseModel):
    url: str
    events: list[str]
    secret: str

    @field_validator("url")
    @classmethod
    def validate_webhook_url(cls, v: str) -> str:
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("Webhook URL must use http or https scheme only")
        host = (parsed.hostname or "").strip()
        if not host:
            raise ValueError("Webhook URL must have a valid host")
        if _is_private_or_localhost(host):
            raise ValueError("Webhook URL must not point to private/internal IPs or localhost")
        return v


class WebhookConfigListResponse(BaseModel):
    webhooks: list[WebhookConfigItem]


class WebhookUpdateResponse(BaseModel):
    status: str
    webhooks: list[WebhookConfigItem]


class WebhookErrorResponse(BaseModel):
    error: str


# --- User Management ---


class InviteUserRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    role: UserRole = UserRole.VIEWER
    password: str = Field(..., min_length=8, max_length=72)


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime


class UpdateUserRoleRequest(BaseModel):
    role: UserRole


# --- Walkthrough ---


class WalkthroughState(BaseModel):
    completed: dict[str, bool] = Field(default_factory=dict)
    skipped: dict[str, bool] = Field(default_factory=dict)
    version: int = 1


class WalkthroughUpdateRequest(BaseModel):
    completed: dict[str, bool] | None = None
    skipped: dict[str, bool] | None = None


# --- Behavior Analytics / Proctoring ---


class BehaviorEventCreate(BaseModel):
    event_type: str = Field(
        ..., pattern="^(keystroke|paste|tab_switch|focus_loss|code_submit|idle|voice_timing)$"
    )
    timestamp: datetime | None = None
    data: dict | None = None


class BehaviorEventResponse(BaseModel):
    id: UUID
    session_id: UUID
    event_type: str
    timestamp: datetime
    data: dict | None


class BehaviorSummary(BaseModel):
    total_keystrokes: int = 0
    total_pastes: int = 0
    total_paste_chars: int = 0
    tab_switches: int = 0
    total_away_time_ms: int = 0
    focus_losses: int = 0
    avg_typing_speed_wpm: float = 0.0
    longest_idle_ms: int = 0
    code_submissions: int = 0
    integrity_score: float = 10.0
    flags: list[str] = Field(default_factory=list)


class IntegrityAssessment(BaseModel):
    integrity_score: float
    risk_level: str
    flags: list[str]
    summary: str
    details: BehaviorSummary


# --- Job Scraping ---


class JobScrapeRequest(BaseModel):
    search_terms: str = Field(..., min_length=2, max_length=200)
    location: str = Field("", max_length=200)
    page: int = Field(1, ge=1, le=50)


class ScrapedJobItem(BaseModel):
    job_id: str
    job_title: str
    company_name: str
    location: str
    posted_date: str
    job_url: str
    snippet: str
    job_description: str


class JobScrapeResponse(BaseModel):
    query: str
    location: str
    total_results: int
    jobs: list[ScrapedJobItem]


class ScrapedJobImportRequest(BaseModel):
    jobs: list[ScrapedJobItem] = Field(..., min_length=1, max_length=50)
    role_type: RoleType = RoleType.MIXED
    interview_format: InterviewFormat = InterviewFormat.TEXT
    interview_config: InterviewConfig = Field(default_factory=InterviewConfig)
    auto_extract_skills: bool = Field(
        False, description="Use AI to extract skills from job descriptions"
    )


class ScrapedJobImportResult(BaseModel):
    total: int
    created: int
    errors: int
    results: list[dict]


# --- ATS Integration ---


class ATSConfig(BaseModel):
    platform: str = Field(..., pattern="^(greenhouse|lever|workable)$")
    api_key: str = Field(..., min_length=1)
    enabled: bool = True
    # Platform-specific fields (optional, used when pushing)
    application_id: str | None = None
    opportunity_id: str | None = None
    candidate_id: str | None = None
    job_shortcode: str | None = None
    subdomain: str | None = None


class ATSConfigResponse(BaseModel):
    platform: str
    enabled: bool
    connected: bool = True


class ATSPushRequest(BaseModel):
    platform: str = Field(..., pattern="^(greenhouse|lever|workable)$")
    session_id: UUID
    # Optional overrides for platform-specific IDs
    application_id: str | None = None
    opportunity_id: str | None = None
    candidate_id: str | None = None
    job_shortcode: str | None = None


class ATSPushResponse(BaseModel):
    success: bool
    platform: str
    error: str | None = None


# --- Competency Genome ---


class GenomeDimension(BaseModel):
    score: float
    confidence: float
    evidence: str = ""


class CompetencyGenomeResponse(BaseModel):
    id: UUID
    candidate_email: str
    candidate_name: str | None = None
    genome_data: dict = {}
    version: int = 1
    model_config = ConfigDict(from_attributes=True)


class RoleGenomeProfileCreate(BaseModel):
    role_type: str
    title: str
    ideal_genome: dict = {}


class RoleGenomeProfileResponse(BaseModel):
    id: UUID
    role_type: str
    title: str
    ideal_genome: dict = {}
    model_config = ConfigDict(from_attributes=True)


class GenomeCompareRequest(BaseModel):
    candidate_emails: list[str]


class GenomeMatchRequest(BaseModel):
    candidate_email: str


# --- Co-Pilot ---


class CopilotSuggestion(BaseModel):
    question: str
    targets_skill: str
    rationale: str
    difficulty: str


class CopilotSessionCreate(BaseModel):
    config: dict = Field(default_factory=dict)


class CopilotSessionResponse(BaseModel):
    id: UUID
    interview_session_id: UUID
    user_id: UUID
    status: str
    suggestions: list = []
    competency_coverage: dict = {}
    legal_alerts: list = []
    started_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# --- Decision Trees ---


class TreeNode(BaseModel):
    id: str
    type: str  # "entry", "question_block", "exit"
    config: dict = {}
    branches: list[dict] = []
    next: str | None = None


class DecisionTreeCreate(BaseModel):
    name: str
    description: str = ""
    role_type: str = ""
    tree_data: dict = {}


class DecisionTreeResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    role_type: str | None = None
    tree_data: dict = {}
    is_published: bool = False
    usage_count: int = 0
    created_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


# --- Training Simulator ---


class CandidatePersona(BaseModel):
    name: str = "Alex Chen"
    experience_years: int = 5
    skill_level: str = "senior"
    personality: str = "confident"
    hidden_strengths: list[str] = []
    hidden_weaknesses: list[str] = []
    background: str = ""


class SimulationCreate(BaseModel):
    role_type: str
    persona: CandidatePersona | None = None


class SimulationMessage(BaseModel):
    content: str


class InterviewerScorecard(BaseModel):
    overall: float = 0
    question_quality: dict = {}
    competency_coverage: dict = {}
    bias_avoidance: dict = {}
    candidate_experience: dict = {}
    depth_vs_breadth: dict = {}
    time_management: dict = {}
    tips: list[str] = []


class SimulationResponse(BaseModel):
    id: UUID
    role_type: str
    candidate_persona: dict = {}
    messages: list = []
    status: str = "active"
    scorecard: dict | None = None
    duration_seconds: int | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


# --- Clips ---


class ClipResponse(BaseModel):
    id: UUID
    session_id: UUID
    clip_type: str
    title: str
    description: str | None = None
    message_start_index: int
    message_end_index: int
    transcript_excerpt: str
    importance_score: float | None = None
    tags: list = []
    share_token: str | None = None
    created_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class ClipCollectionCreate(BaseModel):
    title: str
    description: str = ""
    clip_ids: list[str] = []


class ClipCollectionResponse(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    clip_ids: list = []
    share_token: str | None = None
    created_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


# --- Company Values / Cultural Fit ---


class CompanyValue(BaseModel):
    name: str
    definition: str = ""
    weight: float = 0.25
    behavioral_indicators: list[str] = []


class CompanyValuesUpdate(BaseModel):
    values: list[CompanyValue]


class CompanyValuesResponse(BaseModel):
    id: UUID
    org_id: UUID
    values: list = []
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class ValuesAssessmentResponse(BaseModel):
    id: UUID
    session_id: UUID
    value_scores: dict = {}
    overall_fit_score: float | None = None
    fit_label: str | None = None
    ai_narrative: str | None = None
    created_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


# --- Predictive Hiring Success ---


class HiringOutcomeCreate(BaseModel):
    session_id: UUID
    candidate_email: str
    was_hired: bool
    hire_date: datetime | None = None


class HiringOutcomeUpdate(BaseModel):
    performance_rating: float | None = None
    retention_months: int | None = None
    is_still_employed: bool | None = None
    left_reason: str | None = None
    manager_feedback: str | None = None


class HiringOutcomeResponse(BaseModel):
    id: UUID
    session_id: UUID
    candidate_email: str
    was_hired: bool
    performance_rating: float | None = None
    retention_months: int | None = None
    is_still_employed: bool | None = None
    created_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class PredictionResponse(BaseModel):
    success_probability: float
    confidence: str
    contributing_factors: list[dict] = []
    risk_factors: list[dict] = []
    is_heuristic: bool = False


class PredictionModelResponse(BaseModel):
    id: UUID
    model_version: int
    training_sample_size: int | None = None
    feature_weights: dict = {}
    accuracy_metrics: dict = {}
    is_active: bool = True
    trained_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


# --- Knowledge Base ---


class KnowledgeEntryResponse(BaseModel):
    id: UUID
    category: str
    title: str
    content: str
    source_data: dict = {}
    confidence: float | None = None
    tags: list = []
    created_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class KnowledgeQueryRequest(BaseModel):
    query: str


class KnowledgeQueryResponse(BaseModel):
    answer: str
    sources: list[dict] = []
    query_id: UUID | None = None


# --- Accessibility ---


class AccessibilityPreferences(BaseModel):
    extended_time: bool = False
    time_multiplier: float = 1.0
    screen_reader_optimized: bool = False
    high_contrast: bool = False
    dyslexia_friendly_font: bool = False
    large_text: bool = False
    reduced_motion: bool = False
    keyboard_only_navigation: bool = False


class AccessibilityConfig(BaseModel):
    mode: str = "standard"  # "standard" or "accessible"
    preferences: AccessibilityPreferences = Field(default_factory=AccessibilityPreferences)
    accommodations_notes: str = ""


class AccessibilityOrgSettings(BaseModel):
    default_mode: str = "offer_choice"
    allowed_accommodations: list[str] = Field(
        default_factory=lambda: [
            "extended_time",
            "screen_reader",
            "high_contrast",
            "dyslexia_font",
            "large_text",
            "reduced_motion",
            "keyboard_only",
        ]
    )
    custom_instructions: str = ""
