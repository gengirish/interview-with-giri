"""Tests for custom scoring rubrics."""

from unittest.mock import AsyncMock, patch

import pytest

from interviewbot.models.tables import InterviewMessage
from interviewbot.services.scoring_engine import score_interview
from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _auth_headers(client):
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.mark.asyncio
async def test_create_job_with_rubric(client, admin_headers):
    """Creating a job with scoring_rubric stores it correctly."""
    headers = await _auth_headers(client)
    rubric = [
        {"dimension": "Technical Depth", "weight": 1.5, "description": "Depth of knowledge"},
        {"dimension": "Communication", "weight": 1.0, "description": "Clarity of expression"},
    ]
    payload = {**JOB_PAYLOAD, "scoring_rubric": rubric}
    resp = await client.post("/api/v1/job-postings", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["scoring_rubric"] == rubric


@pytest.mark.asyncio
async def test_get_job_returns_rubric(client, admin_headers, db):
    """GET job returns scoring_rubric field."""
    headers = await _auth_headers(client)
    rubric = [
        {"dimension": "Problem Solving", "weight": 1.0, "description": "Analytical skills"},
    ]
    create_resp = await client.post(
        "/api/v1/job-postings",
        json={**JOB_PAYLOAD, "scoring_rubric": rubric},
        headers=headers,
    )
    job_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/job-postings/{job_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["scoring_rubric"] == rubric


@pytest.mark.asyncio
async def test_update_job_rubric(client, admin_headers, db):
    """PATCH job can update scoring_rubric."""
    headers = await _auth_headers(client)
    create_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = create_resp.json()["id"]

    new_rubric = [
        {"dimension": "Updated Dim", "weight": 2.0, "description": "Updated desc"},
    ]
    resp = await client.patch(
        f"/api/v1/job-postings/{job_id}",
        json={"scoring_rubric": new_rubric},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["scoring_rubric"] == new_rubric


@pytest.mark.asyncio
async def test_scoring_engine_uses_custom_rubric(db):
    """Score interview uses custom rubric prompt when rubric is set."""
    from uuid import UUID

    from interviewbot.models.tables import InterviewSession, JobPosting, Organization
    from tests.conftest import DEMO_ORG_ID

    org = Organization(id=UUID(DEMO_ORG_ID), name="Rubric Org")
    db.add(org)
    await db.flush()
    rubric = [
        {"dimension": "Custom Dim", "weight": 1.0, "description": "Custom assessment"},
    ]
    job = JobPosting(
        org_id=org.id,
        title="Rubric Job",
        role_type="technical",
        job_description="Job " * 10,
        scoring_rubric=rubric,
    )
    db.add(job)
    await db.flush()
    session = InterviewSession(
        job_posting_id=job.id,
        org_id=org.id,
        token="rubric-session-token",
        status="completed",
    )
    db.add(session)
    await db.flush()
    for i in range(3):
        msg = InterviewMessage(
            session_id=session.id,
            role="interviewer" if i % 2 == 0 else "candidate",
            content=f"Message {i}",
        )
        db.add(msg)
    await db.commit()

    def _mock_chat(messages, temperature=0.2):
        import json

        return json.dumps(
            {
                "skill_scores": {"Custom Dim": {"score": 8.0, "evidence": "Good", "notes": ""}},
                "behavioral_scores": {},
                "overall_score": 8.0,
                "confidence_score": 0.9,
                "summary": "Strong candidate",
                "strengths": ["Custom strength"],
                "concerns": [],
                "recommendation": "Hire",
            }
        )

    with patch("interviewbot.services.scoring_engine.AIEngine") as mock_engine:
        mock_instance = mock_engine.return_value
        mock_instance.chat = AsyncMock(side_effect=_mock_chat)

        report = await score_interview(str(session.id), db)

    assert report is not None
    assert report.skill_scores.get("Custom Dim") is not None
    assert report.skill_scores["Custom Dim"].get("score") == 8.0
