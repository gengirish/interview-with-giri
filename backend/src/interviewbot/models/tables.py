from datetime import UTC, datetime
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organization"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    domain = Column(String(255))
    settings = Column(JSONB, default=dict)
    is_active = Column(Boolean, default=True)
    agentmail_inbox_id = Column(String(255), nullable=True)
    agentmail_email = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    subscriptions = relationship(
        "Subscription", back_populates="organization", cascade="all, delete-orphan"
    )
    job_postings = relationship(
        "JobPosting", back_populates="organization", cascade="all, delete-orphan"
    )


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="viewer")
    is_active = Column(Boolean, default=True)
    walkthrough_progress = Column(JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    organization = relationship("Organization", back_populates="users")


class Subscription(Base):
    __tablename__ = "subscription"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    stripe_customer_id = Column(String(255))
    stripe_subscription_id = Column(String(255))
    plan_tier = Column(String(50), nullable=False, default="free")
    interviews_limit = Column(Integer, default=10)
    interviews_used = Column(Integer, default=0)
    current_period_start = Column(DateTime(timezone=True))
    current_period_end = Column(DateTime(timezone=True))
    status = Column(String(50), default="active")
    created_at = Column(DateTime(timezone=True), default=utcnow)

    organization = relationship("Organization", back_populates="subscriptions")


class JobPosting(Base):
    __tablename__ = "job_posting"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    role_type = Column(String(50), nullable=False)
    job_description = Column(Text, nullable=False)
    required_skills = Column(JSONB, default=list)
    interview_config = Column(
        JSONB,
        default=lambda: {
            "num_questions": 10,
            "duration_minutes": 30,
            "difficulty": "medium",
            "include_coding": False,
        },
    )
    interview_format = Column(String(20), default="text")
    scoring_rubric = Column(JSONB, nullable=True)
    is_active = Column(Boolean, default=True)
    decision_tree_id = Column(
        UUID(as_uuid=True),
        ForeignKey("interview_decision_tree.id"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization = relationship("Organization", back_populates="job_postings")
    sessions = relationship(
        "InterviewSession", back_populates="job_posting", cascade="all, delete-orphan"
    )


class InterviewSession(Base):
    __tablename__ = "interview_session"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_posting_id = Column(
        UUID(as_uuid=True), ForeignKey("job_posting.id"), nullable=False, index=True
    )
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    token = Column(String(64), unique=True, nullable=False)
    candidate_name = Column(String(255))
    candidate_email = Column(String(255))
    resume_url = Column(Text, nullable=True)
    is_shortlisted = Column(Boolean, default=False)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    difficulty_progression = Column(
        JSONB, nullable=True
    )  # [{question: 1, difficulty: "medium", ...}]
    is_practice = Column(Boolean, default=False)
    status = Column(String(30), default="pending", index=True)
    format = Column(String(20), default="text")
    overall_score = Column(Numeric(4, 2))
    duration_seconds = Column(Integer)
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    decision_tree_id = Column(
        UUID(as_uuid=True),
        ForeignKey("interview_decision_tree.id"),
        nullable=True,
    )
    tree_state = Column(JSONB, nullable=True)
    accessibility_config = Column(JSONB, nullable=True)

    job_posting = relationship("JobPosting", back_populates="sessions")
    messages = relationship(
        "InterviewMessage", back_populates="session", cascade="all, delete-orphan"
    )
    report = relationship(
        "CandidateReport", back_populates="session", uselist=False, cascade="all, delete-orphan"
    )
    behavior_events = relationship(
        "BehaviorEvent", back_populates="session", cascade="all, delete-orphan"
    )


class BehaviorEvent(Base):
    __tablename__ = "behavior_event"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        UUID(as_uuid=True), ForeignKey("interview_session.id"), nullable=False, index=True
    )
    event_type = Column(String(50), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    data = Column(JSONB, nullable=True)

    session = relationship("InterviewSession", back_populates="behavior_events")


class InterviewMessage(Base):
    __tablename__ = "interview_message"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        UUID(as_uuid=True), ForeignKey("interview_session.id"), nullable=False, index=True
    )
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    media_url = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    engagement_metrics = Column(JSONB, nullable=True)

    session = relationship("InterviewSession", back_populates="messages")


class CandidateReport(Base):
    __tablename__ = "candidate_report"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        UUID(as_uuid=True), ForeignKey("interview_session.id"), unique=True, nullable=False
    )
    skill_scores = Column(JSONB, default=dict)
    behavioral_scores = Column(JSONB, default=dict)
    ai_summary = Column(Text)
    strengths = Column(JSONB, default=list)
    concerns = Column(JSONB, default=list)
    recommendation = Column(String(50))
    confidence_score = Column(Numeric(3, 2))
    extended_data = Column(JSONB, default=dict)
    engagement_profile = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    share_token = Column(String(64), unique=True, nullable=True, index=True)
    share_expires_at = Column(DateTime(timezone=True), nullable=True)

    session = relationship("InterviewSession", back_populates="report")


class InterviewTemplate(Base):
    __tablename__ = "interview_template"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    role_type = Column(String(50), nullable=False)
    job_description_template = Column(Text, nullable=True)
    required_skills = Column(JSONB, default=list)
    interview_config = Column(JSONB, default=dict)
    interview_format = Column(String(20), default="text")
    is_system = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class ReportComment(Base):
    __tablename__ = "report_comment"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id = Column(
        UUID(as_uuid=True), ForeignKey("candidate_report.id"), nullable=False, index=True
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    mentioned_user_ids = Column(JSONB, default=list)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class CandidateFeedback(Base):
    __tablename__ = "candidate_feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("interview_session.id"),
        unique=True,
        nullable=False,
    )
    overall_rating = Column(Integer, nullable=False)  # 1-5
    fairness_rating = Column(Integer, nullable=True)  # 1-5
    clarity_rating = Column(Integer, nullable=True)  # 1-5
    relevance_rating = Column(Integer, nullable=True)  # 1-5
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class CopilotSession(Base):
    __tablename__ = "copilot_session"
    __table_args__ = (UniqueConstraint("interview_session_id", "user_id"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    interview_session_id = Column(
        UUID(as_uuid=True), ForeignKey("interview_session.id"), nullable=False, index=True
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(30), default="active")
    suggestions = Column(JSONB, default=list)
    competency_coverage = Column(JSONB, default=dict)
    legal_alerts = Column(JSONB, default=list)
    config = Column(JSONB, default=dict)
    started_at = Column(DateTime(timezone=True), default=utcnow)
    ended_at = Column(DateTime(timezone=True), nullable=True)


class CompetencyGenome(Base):
    __tablename__ = "competency_genome"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    candidate_email = Column(String(255), nullable=False)
    candidate_name = Column(String(255), nullable=True)
    genome_data = Column(JSONB, default=dict)
    version = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (UniqueConstraint("org_id", "candidate_email"),)


class RoleGenomeProfile(Base):
    __tablename__ = "role_genome_profile"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    role_type = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    ideal_genome = Column(JSONB, default=dict)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (UniqueConstraint("org_id", "role_type"),)


class InterviewDecisionTree(Base):
    __tablename__ = "interview_decision_tree"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    role_type = Column(String(100), nullable=True)
    tree_data = Column(JSONB, default=dict)
    is_published = Column(Boolean, default=False)
    usage_count = Column(Integer, default=0)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class InterviewClip(Base):
    __tablename__ = "interview_clip"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("interview_session.id"), nullable=False, index=True)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    clip_type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    message_start_index = Column(Integer, nullable=False)
    message_end_index = Column(Integer, nullable=False)
    transcript_excerpt = Column(Text, nullable=False)
    importance_score = Column(Numeric(3, 2), nullable=True)
    tags = Column(JSONB, default=list)
    share_token = Column(String(64), unique=True, nullable=True, index=True)
    share_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class ClipCollection(Base):
    __tablename__ = "clip_collection"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    clip_ids = Column(JSONB, default=list)
    share_token = Column(String(64), unique=True, nullable=True, index=True)
    share_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class TrainingSimulation(Base):
    __tablename__ = "training_simulation"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    role_type = Column(String(100), nullable=False)
    candidate_persona = Column(JSONB, nullable=False)
    messages = Column(JSONB, default=list)
    status = Column(String(30), default="active")
    scorecard = Column(JSONB, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    started_at = Column(DateTime(timezone=True), default=utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class CompanyValues(Base):
    __tablename__ = "company_values"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    values = Column(JSONB, default=list)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (UniqueConstraint("org_id"),)


class ValuesAssessment(Base):
    __tablename__ = "values_assessment"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("interview_session.id"), nullable=False, index=True)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    value_scores = Column(JSONB, default=dict)
    overall_fit_score = Column(Numeric(4, 2), nullable=True)
    fit_label = Column(String(50), nullable=True)
    ai_narrative = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (UniqueConstraint("session_id"),)


class HiringOutcome(Base):
    __tablename__ = "hiring_outcome"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("interview_session.id"), nullable=False, index=True)
    candidate_email = Column(String(255), nullable=False)
    was_hired = Column(Boolean, nullable=False)
    hire_date = Column(DateTime(timezone=True), nullable=True)
    performance_rating = Column(Numeric(3, 1), nullable=True)
    retention_months = Column(Integer, nullable=True)
    is_still_employed = Column(Boolean, nullable=True)
    left_reason = Column(String(100), nullable=True)
    manager_feedback = Column(Text, nullable=True)
    feedback_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (UniqueConstraint("session_id"),)


class PredictionModel(Base):
    __tablename__ = "prediction_model"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    model_version = Column(Integer, default=1)
    training_sample_size = Column(Integer, nullable=True)
    feature_weights = Column(JSONB, default=dict)
    accuracy_metrics = Column(JSONB, default=dict)
    is_active = Column(Boolean, default=True)
    trained_at = Column(DateTime(timezone=True), default=utcnow)


class KnowledgeEntry(Base):
    __tablename__ = "knowledge_entry"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    category = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    source_data = Column(JSONB, default=dict)
    confidence = Column(Numeric(3, 2), nullable=True)
    tags = Column(JSONB, default=list)
    is_auto_generated = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class KnowledgeQueryLog(Base):
    __tablename__ = "knowledge_query_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    query = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    sources = Column(JSONB, default=list)
    rating = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
