from datetime import UTC, datetime
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, func
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
    is_active = Column(Boolean, default=True)
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
    status = Column(String(30), default="pending", index=True)
    format = Column(String(20), default="text")
    overall_score = Column(Numeric(4, 2))
    duration_seconds = Column(Integer)
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)

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
    created_at = Column(DateTime(timezone=True), default=utcnow)

    session = relationship("InterviewSession", back_populates="report")
