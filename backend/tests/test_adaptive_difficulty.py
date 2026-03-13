"""Tests for adaptive difficulty - difficulty_progression in session response."""

import pytest
from sqlalchemy import select

from interviewbot.models.tables import InterviewSession
from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


@pytest.mark.asyncio
async def test_session_response_includes_difficulty_progression(client, admin_headers, db):
    """InterviewSession response includes difficulty_progression field."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "diff@test.com",
            "org_name": "Diff Corp",
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

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one()
    session.difficulty_progression = [
        {"question": 1, "difficulty": "medium", "adjusted": False},
        {"question": 2, "difficulty": "hard", "adjusted": True},
    ]
    await db.commit()

    resp = await client.get("/api/v1/interviews", headers=headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    session_item = next((s for s in items if s["token"] == token), None)
    assert session_item is not None
    assert "difficulty_progression" in session_item
    assert session_item["difficulty_progression"] == [
        {"question": 1, "difficulty": "medium", "adjusted": False},
        {"question": 2, "difficulty": "hard", "adjusted": True},
    ]
