"""Tests for AI Coach endpoints."""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select, update

from interviewbot.models.tables import InterviewMessage, InterviewSession


async def _create_practice_session(client):
    """Create a practice session and return its token."""
    resp = await client.post(
        "/api/v1/practice/start",
        json={
            "template_id": "builtin-swe",
            "candidate_name": "Coach Test User",
        },
    )
    assert resp.status_code == 200
    return resp.json()["token"]


async def _complete_practice_session(token, db):
    """Mark session as completed and add messages."""
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.token == token)
    )
    session = result.scalar_one()

    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == session.id)
        .values(status="completed")
    )
    db.add(
        InterviewMessage(
            session_id=session.id,
            role="interviewer",
            content="Tell me about your Python experience.",
        )
    )
    db.add(
        InterviewMessage(
            session_id=session.id,
            role="candidate",
            content="I have 5 years of Python with FastAPI and Django.",
        )
    )
    await db.commit()
    return str(session.id)


MOCK_COACHING_REPORT = {
    "readiness_score": 72,
    "readiness_label": "Getting There",
    "summary": "Good foundation with room to improve depth.",
    "strengths": [
        {
            "title": "Clear Communication",
            "detail": "Articulated experience well.",
            "question_index": 0,
        },
    ],
    "improvements": [
        {
            "title": "Add Metrics",
            "detail": "Quantify achievements.",
            "tip": "Use numbers to describe impact.",
            "priority": "high",
            "question_index": 1,
        },
    ],
    "question_feedback": [
        {
            "question_index": 0,
            "question_summary": "Python experience",
            "score": 7,
            "what_went_well": "Mentioned specific frameworks.",
            "what_to_improve": "Add years per framework.",
            "sample_answer_snippet": "I have 3 years of FastAPI...",
        },
    ],
    "study_plan": [
        {
            "topic": "System Design",
            "reason": "Not covered in answers.",
            "resources": "Practice URL shortener design.",
        },
    ],
    "star_method_tips": [
        "Structure behavioral answers with Situation, Task, Action, Result.",
    ],
}


@pytest.mark.asyncio
async def test_coach_analyze_success(client, db):
    """Coaching report is generated for a completed practice session."""
    token = await _create_practice_session(client)
    await _complete_practice_session(token, db)

    with patch(
        "interviewbot.routers.coach.generate_coaching_report",
        new_callable=AsyncMock,
        return_value={
            **MOCK_COACHING_REPORT,
            "session_id": "test-id",
            "candidate_name": "Coach Test User",
            "job_title": "Practice: Software Engineer",
            "role_type": "technical",
            "duration_seconds": None,
        },
    ):
        resp = await client.post(f"/api/v1/coach/analyze/{token}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["readiness_score"] == 72
        assert data["readiness_label"] == "Getting There"
        assert len(data["strengths"]) >= 1
        assert len(data["improvements"]) >= 1
        assert len(data["question_feedback"]) >= 1
        assert len(data["study_plan"]) >= 1


@pytest.mark.asyncio
async def test_coach_analyze_not_completed(client, db):
    """Returns 400 when session is not yet completed."""
    token = await _create_practice_session(client)

    resp = await client.post(f"/api/v1/coach/analyze/{token}")
    assert resp.status_code == 400
    assert "completed" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_coach_analyze_not_found(client):
    """Returns 404 for an invalid token."""
    resp = await client.post("/api/v1/coach/analyze/nonexistent-token")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_coach_no_auth_required(client, db):
    """Coach endpoint works without authentication."""
    token = await _create_practice_session(client)
    await _complete_practice_session(token, db)

    with patch(
        "interviewbot.routers.coach.generate_coaching_report",
        new_callable=AsyncMock,
        return_value={
            **MOCK_COACHING_REPORT,
            "session_id": "test-id",
            "candidate_name": "No Auth User",
            "job_title": "Practice: Software Engineer",
            "role_type": "technical",
            "duration_seconds": None,
        },
    ):
        resp = await client.post(f"/api/v1/coach/analyze/{token}")
        assert resp.status_code == 200
