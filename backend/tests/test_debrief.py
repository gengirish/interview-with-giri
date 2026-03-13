"""Tests for debrief endpoint - AI hiring debrief comparing candidates."""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select, update

from interviewbot.models.tables import CandidateReport, InterviewSession
from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _setup_two_completed_interviews(client, db):
    """Create org, job, 2 sessions (completed) with reports. Returns (session_ids, headers)."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "debrief@test.com",
            "org_name": "Debrief Corp",
        },
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    job = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    assert job.status_code == 201
    job_id = job.json()["id"]

    link1 = await client.post(
        f"/api/v1/job-postings/{job_id}/generate-link",
        headers=headers,
    )
    link2 = await client.post(
        f"/api/v1/job-postings/{job_id}/generate-link",
        headers=headers,
    )
    assert link1.status_code == 200
    assert link2.status_code == 200
    token1 = link1.json()["token"]
    token2 = link2.json()["token"]

    await client.post(
        f"/api/v1/interviews/public/{token1}/start",
        json={"candidate_name": "Dave", "candidate_email": "dave@test.com"},
    )
    await client.post(
        f"/api/v1/interviews/public/{token2}/start",
        json={"candidate_name": "Eve", "candidate_email": "eve@test.com"},
    )

    for token in (token1, token2):
        result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
        session = result.scalar_one()
        await db.execute(
            update(InterviewSession)
            .where(InterviewSession.id == session.id)
            .values(status="completed", overall_score=7.5)
        )
        db.add(
            CandidateReport(
                session_id=session.id,
                ai_summary="Solid candidate.",
                recommendation="hire",
                strengths=["Python"],
                concerns=[],
                confidence_score=0.85,
            )
        )
    await db.commit()

    result = await db.execute(
        select(InterviewSession.id).where(InterviewSession.token.in_([token1, token2]))
    )
    ids = [str(r.id) for r in result.scalars().all()]
    return ids, headers


@pytest.mark.asyncio
async def test_generate_debrief_success(client, db):
    """Debrief generates comparison document for 2+ candidates."""
    session_ids, headers = await _setup_two_completed_interviews(client, db)

    with patch("interviewbot.services.ai_engine.AIEngine") as mock_engine_cls:
        mock_engine = AsyncMock()
        mock_engine.chat.return_value = (
            "# Hiring Debrief\n\n## Executive Summary\nBoth candidates are strong."
        )
        mock_engine_cls.return_value = mock_engine

        resp = await client.post(
            "/api/v1/reports/debrief",
            json={"session_ids": session_ids},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "debrief" in data
        assert "candidates" in data
        assert len(data["candidates"]) >= 2


@pytest.mark.asyncio
async def test_debrief_requires_minimum_2_candidates(client, admin_headers):
    """Debrief with fewer than 2 session IDs returns 400."""
    resp = await client.post(
        "/api/v1/reports/debrief",
        json={"session_ids": ["one"]},
        headers=admin_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_debrief_maximum_5_candidates(client, admin_headers):
    """Debrief with more than 5 session IDs returns 400."""
    ids = [f"id-{i}" for i in range(6)]
    resp = await client.post(
        "/api/v1/reports/debrief",
        json={"session_ids": ids},
        headers=admin_headers,
    )
    assert resp.status_code == 400
