"""Tests for skills insights endpoint."""

import pytest
from sqlalchemy import select, update

from interviewbot.models.tables import CandidateReport, InterviewSession
from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


@pytest.mark.asyncio
async def test_skills_insights_empty(client, admin_headers):
    """Returns empty insights when no reports exist."""
    resp = await client.get(
        "/api/v1/analytics/skills-insights",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_candidates"] == 0
    assert data["skill_averages"] == {}


@pytest.mark.asyncio
async def test_skills_insights_with_data(client, db):
    """Returns aggregated skill data from completed interviews."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "skills@test.com",
            "org_name": "Skills Corp",
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
        json={"candidate_name": "Frank", "candidate_email": "frank@test.com"},
    )

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one()
    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == session.id)
        .values(status="completed")
    )
    db.add(
        CandidateReport(
            session_id=session.id,
            ai_summary="Good.",
            recommendation="hire",
            strengths=["Python"],
            concerns=[],
            confidence_score=0.9,
            skill_scores={
                "Python": {"score": 8.0, "evidence": "Strong", "notes": ""},
                "FastAPI": {"score": 7.0, "evidence": "Good", "notes": ""},
            },
            behavioral_scores={"communication": {"score": 9.0, "evidence": "Clear", "notes": ""}},
        )
    )
    await db.commit()

    resp = await client.get(
        "/api/v1/analytics/skills-insights",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_candidates"] >= 1
    assert "skill_averages" in data
    assert "Python" in data["skill_averages"]
    assert "skill_gaps" in data
    assert "skill_strengths" in data


@pytest.mark.asyncio
async def test_skills_insights_requires_auth(client):
    resp = await client.get("/api/v1/analytics/skills-insights")
    assert resp.status_code in (401, 403)
