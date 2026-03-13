"""Tests for candidate comparison dashboard."""

import uuid

import pytest

from interviewbot.models.tables import CandidateReport, InterviewSession
from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _auth_headers(client):
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _setup_job_with_completed_sessions(client, db, count=2):
    """Create job with completed interview sessions. Returns (headers, job_id)."""
    headers = await _auth_headers(client)
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    for i in range(count):
        link_resp = await client.post(
            f"/api/v1/job-postings/{job_id}/generate-link", headers=headers
        )
        token = link_resp.json()["token"]
        await client.post(
            f"/api/v1/interviews/public/{token}/start",
            json={
                "candidate_name": f"Candidate {i}",
                "candidate_email": f"c{i}@test.com",
            },
        )

    list_resp = await client.get("/api/v1/interviews", headers=headers)
    sessions = list_resp.json()["items"]

    from sqlalchemy import update

    for s in sessions:
        await db.execute(
            update(InterviewSession)
            .where(InterviewSession.id == uuid.UUID(s["id"]))
            .values(status="completed", overall_score=7.0 + (sessions.index(s) * 0.5))
        )
        report = CandidateReport(
            session_id=uuid.UUID(s["id"]),
            ai_summary="Good",
            recommendation="hire",
            confidence_score=0.85,
        )
        db.add(report)
    await db.commit()
    return headers, job_id


@pytest.mark.asyncio
async def test_compare_candidates_returns_scored_sessions(client, admin_headers, db):
    """GET /analytics/compare?job_id=X returns completed sessions with scores."""
    headers, job_id = await _setup_job_with_completed_sessions(client, db, count=2)
    resp = await client.get(f"/api/v1/analytics/compare?job_id={job_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 2
    for item in data:
        assert "session_id" in item
        assert "candidate_name" in item
        assert "overall_score" in item
        assert "is_shortlisted" in item


@pytest.mark.asyncio
async def test_compare_candidates_empty_when_no_completions(client, admin_headers, db):
    """Compare returns empty list when no completed interviews."""
    headers = await _auth_headers(client)
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    resp = await client.get(f"/api/v1/analytics/compare?job_id={job_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_toggle_shortlist(client, admin_headers, db):
    """PATCH /interviews/{id}/shortlist toggles is_shortlisted."""
    headers, _job_id = await _setup_job_with_completed_sessions(client, db, count=1)
    list_resp = await client.get("/api/v1/interviews", headers=headers)
    session_id = list_resp.json()["items"][0]["id"]

    resp = await client.patch(f"/api/v1/interviews/{session_id}/shortlist", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_shortlisted"] is True

    resp2 = await client.patch(f"/api/v1/interviews/{session_id}/shortlist", headers=headers)
    assert resp2.status_code == 200
    assert resp2.json()["is_shortlisted"] is False


@pytest.mark.asyncio
async def test_toggle_shortlist_not_found(client, admin_headers):
    """Toggle shortlist returns 404 for non-existent session."""
    headers = await _auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.patch(f"/api/v1/interviews/{fake_id}/shortlist", headers=headers)
    assert resp.status_code == 404
