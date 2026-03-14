"""Tests for AI Interview Co-Pilot endpoints."""

from unittest.mock import AsyncMock, patch
import uuid

import pytest
from sqlalchemy import select

from interviewbot.models.tables import (
    CopilotSession,
    InterviewMessage,
    InterviewSession,
    JobPosting,
)
from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _setup_in_progress_interview(client, db):
    """Create org, job, in-progress session. Returns (session_id, headers)."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "copilot@test.com",
            "org_name": "Copilot Corp",
        },
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    job = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    assert job.status_code == 201
    job_id = job.json()["id"]

    link = await client.post(
        f"/api/v1/job-postings/{job_id}/generate-link",
        headers=headers,
    )
    assert link.status_code == 200
    token = link.json()["token"]

    await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "Bob", "candidate_email": "bob@test.com"},
    )

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one()
    return str(session.id), headers


@pytest.mark.asyncio
async def test_start_copilot(client, db):
    """Starting a copilot session creates a new CopilotSession."""
    session_id, headers = await _setup_in_progress_interview(client, db)

    resp = await client.post(
        f"/api/v1/copilot/start/{session_id}",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["interview_session_id"] == session_id
    assert data["status"] == "active"
    assert "id" in data
    assert "user_id" in data


@pytest.mark.asyncio
async def test_start_copilot_twice_returns_existing(client, db):
    """Starting copilot twice for same session returns existing active session."""
    session_id, headers = await _setup_in_progress_interview(client, db)

    resp1 = await client.post(
        f"/api/v1/copilot/start/{session_id}",
        headers=headers,
    )
    assert resp1.status_code == 200
    copilot_id = resp1.json()["id"]

    resp2 = await client.post(
        f"/api/v1/copilot/start/{session_id}",
        headers=headers,
    )
    assert resp2.status_code == 200
    assert resp2.json()["id"] == copilot_id


@pytest.mark.asyncio
async def test_start_copilot_404_invalid_session(client, admin_headers):
    """Returns 404 for non-existent interview session."""
    fake_id = str(uuid.uuid4())
    resp = await client.post(
        f"/api/v1/copilot/start/{fake_id}",
        headers=admin_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_copilot(client, db):
    """Get copilot session by ID."""
    session_id, headers = await _setup_in_progress_interview(client, db)
    start_resp = await client.post(
        f"/api/v1/copilot/start/{session_id}",
        headers=headers,
    )
    copilot_id = start_resp.json()["id"]

    resp = await client.get(f"/api/v1/copilot/{copilot_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == copilot_id


@pytest.mark.asyncio
async def test_get_copilot_404(client, admin_headers):
    """Returns 404 for non-existent copilot."""
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/api/v1/copilot/{fake_id}", headers=admin_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_coverage(client, db):
    """Get competency coverage for interview."""
    session_id, headers = await _setup_in_progress_interview(client, db)

    job_result = await db.execute(
        select(JobPosting).join(
            InterviewSession, InterviewSession.job_posting_id == JobPosting.id
        ).where(InterviewSession.id == uuid.UUID(session_id))
    )
    job = job_result.scalar_one()
    job.required_skills = ["Python", "FastAPI"]
    await db.commit()

    db.add(
        InterviewMessage(
            session_id=uuid.UUID(session_id),
            role="interviewer",
            content="Tell me about Python.",
        )
    )
    db.add(
        InterviewMessage(
            session_id=uuid.UUID(session_id),
            role="candidate",
            content="I love Python and FastAPI.",
        )
    )
    await db.commit()

    start_resp = await client.post(
        f"/api/v1/copilot/start/{session_id}",
        headers=headers,
    )
    copilot_id = start_resp.json()["id"]

    resp = await client.get(
        f"/api/v1/copilot/{copilot_id}/coverage",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "coverage" in data
    assert "Python" in data["coverage"]
    assert "FastAPI" in data["coverage"]


@pytest.mark.asyncio
async def test_get_suggestions(client, db):
    """Generate follow-up suggestions."""
    session_id, headers = await _setup_in_progress_interview(client, db)

    db.add(
        InterviewMessage(
            session_id=uuid.UUID(session_id),
            role="interviewer",
            content="Tell me about Python.",
        )
    )
    db.add(
        InterviewMessage(
            session_id=uuid.UUID(session_id),
            role="candidate",
            content="I have 5 years of Python experience.",
        )
    )
    await db.commit()

    start_resp = await client.post(
        f"/api/v1/copilot/start/{session_id}",
        headers=headers,
    )
    copilot_id = start_resp.json()["id"]

    with patch(
        "interviewbot.services.copilot_engine.generate_suggestions",
        new_callable=AsyncMock,
        return_value=[
            {
                "question": "How would you design a caching layer?",
                "targets_skill": "System Design",
                "rationale": "Candidate mentioned Redis.",
                "difficulty": "medium",
            },
        ],
    ):
        resp = await client.post(
            f"/api/v1/copilot/{copilot_id}/suggest",
            headers=headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "suggestions" in data
    assert len(data["suggestions"]) >= 1
    assert data["suggestions"][0]["question"] == "How would you design a caching layer?"


@pytest.mark.asyncio
async def test_check_legal_risky(client, db):
    """Check legal risk - stores alert when risky."""
    session_id, headers = await _setup_in_progress_interview(client, db)
    start_resp = await client.post(
        f"/api/v1/copilot/start/{session_id}",
        headers=headers,
    )
    copilot_id = start_resp.json()["id"]

    with patch(
        "interviewbot.services.copilot_engine.check_legal_risk",
        new_callable=AsyncMock,
        return_value={
            "is_risky": True,
            "risk_type": "age_bias",
            "severity": "warning",
            "suggestion": "Ask about experience instead.",
        },
    ):
        resp = await client.post(
            f"/api/v1/copilot/{copilot_id}/check-legal",
            headers=headers,
            json={"text": "How old are you?"},
        )
    assert resp.status_code == 200
    assert resp.json()["is_risky"] is True

    get_resp = await client.get(f"/api/v1/copilot/{copilot_id}", headers=headers)
    alerts = get_resp.json().get("legal_alerts", [])
    assert len(alerts) >= 1
    assert alerts[0]["risk_type"] == "age_bias"


@pytest.mark.asyncio
async def test_check_legal_safe(client, db):
    """Check legal risk - no alert when safe."""
    session_id, headers = await _setup_in_progress_interview(client, db)
    start_resp = await client.post(
        f"/api/v1/copilot/start/{session_id}",
        headers=headers,
    )
    copilot_id = start_resp.json()["id"]

    with patch(
        "interviewbot.services.copilot_engine.check_legal_risk",
        new_callable=AsyncMock,
        return_value={"is_risky": False},
    ):
        resp = await client.post(
            f"/api/v1/copilot/{copilot_id}/check-legal",
            headers=headers,
            json={"text": "Tell me about your Python experience."},
        )
    assert resp.status_code == 200
    assert resp.json()["is_risky"] is False


@pytest.mark.asyncio
async def test_check_legal_400_missing_text(client, db):
    """Returns 400 when question text is missing."""
    session_id, headers = await _setup_in_progress_interview(client, db)
    start_resp = await client.post(
        f"/api/v1/copilot/start/{session_id}",
        headers=headers,
    )
    copilot_id = start_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/copilot/{copilot_id}/check-legal",
        headers=headers,
        json={},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_end_copilot(client, db):
    """End copilot session."""
    session_id, headers = await _setup_in_progress_interview(client, db)
    start_resp = await client.post(
        f"/api/v1/copilot/start/{session_id}",
        headers=headers,
    )
    copilot_id = start_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/copilot/{copilot_id}/end",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ended"

    get_resp = await client.get(f"/api/v1/copilot/{copilot_id}", headers=headers)
    assert get_resp.json()["status"] == "ended"


@pytest.mark.asyncio
async def test_copilot_history(client, db):
    """List copilot history for current user."""
    session_id, headers = await _setup_in_progress_interview(client, db)
    await client.post(
        f"/api/v1/copilot/start/{session_id}",
        headers=headers,
    )

    resp = await client.get("/api/v1/copilot/history/list", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["interview_session_id"] == session_id
