"""Unit tests for scoring engine."""

from unittest.mock import AsyncMock, patch

import pytest

from interviewbot.models.tables import (
    CandidateReport,
    InterviewMessage,
    InterviewSession,
    JobPosting,
)
from interviewbot.services.scoring_engine import score_interview


@pytest.mark.asyncio
async def test_score_interview_session_not_found(db):
    result = await score_interview("00000000-0000-0000-0000-000000000000", db)
    assert result is None


@pytest.mark.asyncio
async def test_score_interview_no_messages(db):
    from interviewbot.models.tables import Organization

    org = Organization(name="Test Org")
    db.add(org)
    await db.flush()

    job = JobPosting(
        org_id=org.id,
        title="Test Job",
        role_type="technical",
        job_description="Test",
        required_skills=["Python"],
    )
    db.add(job)
    await db.flush()

    session = InterviewSession(
        job_posting_id=job.id,
        org_id=org.id,
        token="test-token-123",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    result = await score_interview(str(session.id), db)
    assert result is None


@pytest.mark.asyncio
async def test_score_interview_success(db):
    from interviewbot.models.tables import Organization

    org = Organization(name="Scoring Test Org")
    db.add(org)
    await db.flush()

    job = JobPosting(
        org_id=org.id,
        title="Python Developer",
        role_type="technical",
        job_description="Backend developer",
        required_skills=["Python", "FastAPI"],
    )
    db.add(job)
    await db.flush()

    session = InterviewSession(
        job_posting_id=job.id,
        org_id=org.id,
        token="score-test-token",
    )
    db.add(session)
    await db.flush()

    for role, content in [
        ("interviewer", "Tell me about yourself"),
        ("candidate", "I am a developer"),
    ]:
        msg = InterviewMessage(session_id=session.id, role=role, content=content)
        db.add(msg)
    await db.commit()
    await db.refresh(session)

    ai_response = """{
        "skill_scores": {"Python": 8, "FastAPI": 7},
        "behavioral_scores": {"communication": 8},
        "technical_scores": {"problem_solving": 7},
        "overall_score": 7.5,
        "confidence_score": 0.85,
        "summary": "Strong candidate.",
        "strengths": ["Good communication"],
        "concerns": [],
        "recommendation": "Hire",
        "experience_level_assessment": "Mid-level",
        "suggested_follow_up_areas": [],
        "hiring_level_fit": "Good fit"
    }"""

    with patch("interviewbot.services.scoring_engine.AIEngine") as mock_engine_class:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value=ai_response)
        mock_engine_class.return_value = mock_engine

        result = await score_interview(str(session.id), db)

    assert result is not None
    assert isinstance(result, CandidateReport)
    assert result.session_id == session.id
    assert result.ai_summary == "Strong candidate."
    assert result.recommendation == "hire"
    assert float(result.confidence_score) == pytest.approx(0.85)
