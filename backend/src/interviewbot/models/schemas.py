from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# --- Enums ---

class InterviewFormat(str, Enum):
    TEXT = "text"
    VOICE = "voice"
    VIDEO = "video"


class RoleType(str, Enum):
    TECHNICAL = "technical"
    NON_TECHNICAL = "non_technical"
    MIXED = "mixed"


class UserRole(str, Enum):
    ADMIN = "admin"
    HIRING_MANAGER = "hiring_manager"
    VIEWER = "viewer"


class SessionStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    EXPIRED = "expired"
    DISCONNECTED = "disconnected"


class Recommendation(str, Enum):
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

class SkillScore(BaseModel):
    score: float = Field(..., ge=0.0, le=10.0)
    evidence: str


class BehavioralScore(BaseModel):
    score: float = Field(..., ge=0.0, le=10.0)
    evidence: str


class CandidateReportResponse(BaseModel):
    id: UUID
    session_id: UUID
    candidate_name: str | None = None
    overall_score: float | None
    skill_scores: dict[str, SkillScore]
    behavioral_scores: dict[str, BehavioralScore]
    ai_summary: str | None
    strengths: list[str]
    concerns: list[str]
    recommendation: Recommendation | None
    confidence_score: float | None
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
