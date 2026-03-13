"""Tests for report highlights endpoint."""

from unittest.mock import AsyncMock, patch
import uuid

import pytest
from sqlalchemy import select, update

from interviewbot.models.tables import CandidateReport, InterviewMessage, InterviewSession
from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _setup_completed_interview_with_report(client, db):
    """Create org, job, session (completed), messages, report. Returns (session_id, headers)."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "highlights@test.com",
            "org_name": "Highlights Corp",
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
        json={"candidate_name": "Carol", "candidate_email": "carol@test.com"},
    )

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one()

    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == session.id)
        .values(status="completed", overall_score=8.0)
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
            content="I have 5 years of Python and FastAPI experience.",
        )
    )
    db.add(
        CandidateReport(
            session_id=session.id,
            ai_summary="Strong candidate.",
            recommendation="hire",
            strengths=["Python"],
            concerns=[],
            confidence_score=0.9,
        )
    )
    await db.commit()
    return str(session.id), headers


@pytest.mark.asyncio
async def test_get_highlights_generates_on_demand(client, db):
    """Highlights are generated on-demand if not cached."""
    session_id, headers = await _setup_completed_interview_with_report(client, db)

    with patch(
        "interviewbot.services.highlight_engine.generate_highlights",
        new_callable=AsyncMock,
        return_value=[
            {
                "message_index": 1,
                "type": "strong_answer",
                "label": "Strong Python experience",
                "summary": "Candidate demonstrated solid Python knowledge.",
                "speaker": "candidate",
            },
        ],
    ):
        resp = await client.get(
            f"/api/v1/reports/{session_id}/highlights",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "highlights" in data
        assert data["session_id"] == session_id
        assert len(data["highlights"]) >= 1


@pytest.mark.asyncio
async def test_get_highlights_returns_cached(client, db):
    """Highlights stored in extended_data are returned without re-generation."""
    session_id, headers = await _setup_completed_interview_with_report(client, db)

    result = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == uuid.UUID(session_id))
    )
    report = result.scalar_one()
    report.extended_data = {
        "highlights": [
            {
                "message_index": 0,
                "type": "strong_answer",
                "label": "Cached highlight",
                "summary": "Pre-generated.",
                "speaker": "candidate",
            },
        ],
    }
    await db.commit()

    with patch(
        "interviewbot.services.highlight_engine.generate_highlights",
        new_callable=AsyncMock,
    ) as mock_gen:
        resp = await client.get(
            f"/api/v1/reports/{session_id}/highlights",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["highlights"][0]["label"] == "Cached highlight"
        mock_gen.assert_not_called()


@pytest.mark.asyncio
async def test_get_highlights_404_no_report(client, admin_headers):
    """Returns 404 when report doesn't exist."""
    fake_id = "00000000-0000-0000-0000-000000000099"
    resp = await client.get(
        f"/api/v1/reports/{fake_id}/highlights",
        headers=admin_headers,
    )
    assert resp.status_code == 404
