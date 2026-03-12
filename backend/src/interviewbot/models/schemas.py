from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

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
    password: str = Field(..., min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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


class JobPostingCreateRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    role_type: RoleType
    job_description: str = Field(..., min_length=50)
    required_skills: list[str] = Field(default_factory=list)
    interview_format: InterviewFormat = InterviewFormat.TEXT
    interview_config: InterviewConfig = Field(default_factory=InterviewConfig)


class JobPostingUpdateRequest(BaseModel):
    title: str | None = None
    job_description: str | None = None
    required_skills: list[str] | None = None
    interview_format: InterviewFormat | None = None
    interview_config: InterviewConfig | None = None
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


class InterviewMessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    media_url: str | None
    created_at: datetime


# --- Reports ---


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


class CheckoutRequest(BaseModel):
    plan_id: str
    success_url: str = "http://localhost:3000/settings?billing=success"
    cancel_url: str = "http://localhost:3000/settings?billing=cancelled"


# --- Dashboard ---


class DashboardStats(BaseModel):
    total_interviews: int
    completed_interviews: int
    active_jobs: int
    avg_score: float | None
    interviews_this_month: int
    pass_rate: float | None


# --- User Management ---


class InviteUserRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    role: UserRole = UserRole.VIEWER
    password: str = Field(..., min_length=8)


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime


class UpdateUserRoleRequest(BaseModel):
    role: UserRole


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
