"""Tests for candidate feedback endpoints."""

import pytest
from sqlalchemy import select, update

from interviewbot.models.tables import InterviewSession
from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _setup_completed_interview(client):
    """Signup, create job, generate link, start, mark complete. Returns (token, headers)."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "feedback@test.com",
            "org_name": "Feedback Corp",
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
    return token, headers


@pytest.mark.asyncio
async def test_submit_feedback_success(client, db):
    """Create interview, complete it, submit feedback."""
    token, _ = await _setup_completed_interview(client)

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one()
    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == session.id)
        .values(status="completed")
    )
    await db.commit()

    resp = await client.post(
        f"/api/v1/interviews/public/{token}/feedback",
        json={
            "overall_rating": 5,
            "fairness_rating": 4,
            "clarity_rating": 5,
            "relevance_rating": 4,
            "comment": "Great experience!",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert "message" in data
    assert "Thank you" in data["message"]


@pytest.mark.asyncio
async def test_submit_feedback_requires_completed_interview(client):
    """Feedback on non-completed interview returns 400."""
    token, _ = await _setup_completed_interview(client)
    # Session is in_progress, not completed

    resp = await client.post(
        f"/api/v1/interviews/public/{token}/feedback",
        json={"overall_rating": 5},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_duplicate_feedback_returns_409(client, db):
    """Submitting feedback twice returns 409."""
    token, _ = await _setup_completed_interview(client)

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one()
    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == session.id)
        .values(status="completed")
    )
    await db.commit()

    payload = {"overall_rating": 5}
    resp1 = await client.post(
        f"/api/v1/interviews/public/{token}/feedback",
        json=payload,
    )
    assert resp1.status_code == 200

    resp2 = await client.post(
        f"/api/v1/interviews/public/{token}/feedback",
        json=payload,
    )
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_feedback_invalid_token_returns_404(client):
    """Feedback with invalid token returns 404."""
    resp = await client.post(
        "/api/v1/interviews/public/invalid-token-xyz/feedback",
        json={"overall_rating": 5},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_candidate_satisfaction_empty(client, admin_headers):
    """Satisfaction endpoint returns empty stats when no feedback."""
    resp = await client.get(
        "/api/v1/analytics/candidate-satisfaction",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_responses"] == 0
