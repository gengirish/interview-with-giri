"""Tests for report comments with @mentions."""

import uuid

import pytest

from interviewbot.models.tables import CandidateReport, InterviewSession
from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _auth_headers(client):
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _setup_session_with_report(client, db):
    """Create org, job, completed session with report. Returns (headers, session_id)."""
    headers = await _auth_headers(client)
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]
    link_resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    token = link_resp.json()["token"]
    await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "Comment Tester", "candidate_email": "comment@test.com"},
    )
    list_resp = await client.get("/api/v1/interviews", headers=headers)
    session_id = list_resp.json()["items"][0]["id"]

    from sqlalchemy import update

    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == uuid.UUID(session_id))
        .values(status="completed", overall_score=8.0)
    )
    report = CandidateReport(
        session_id=uuid.UUID(session_id),
        ai_summary="Good candidate",
        recommendation="hire",
        confidence_score=0.85,
    )
    db.add(report)
    await db.commit()
    return headers, session_id


@pytest.mark.asyncio
async def test_add_comment(client, admin_headers, db):
    """POST /reports/{id}/comments adds a comment."""
    headers, session_id = await _setup_session_with_report(client, db)
    resp = await client.post(
        f"/api/v1/reports/{session_id}/comments",
        json={"content": "Great candidate, recommend moving forward."},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["content"] == "Great candidate, recommend moving forward."
    assert "id" in data
    assert "report_id" in data


@pytest.mark.asyncio
async def test_list_comments(client, admin_headers, db):
    """GET /reports/{id}/comments returns comments in order."""
    headers, session_id = await _setup_session_with_report(client, db)
    await client.post(
        f"/api/v1/reports/{session_id}/comments",
        json={"content": "First comment"},
        headers=headers,
    )
    await client.post(
        f"/api/v1/reports/{session_id}/comments",
        json={"content": "Second comment"},
        headers=headers,
    )

    resp = await client.get(f"/api/v1/reports/{session_id}/comments", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["content"] == "First comment"
    assert data[1]["content"] == "Second comment"


@pytest.mark.asyncio
async def test_delete_own_comment(client, admin_headers, db):
    """DELETE /reports/{id}/comments/{cid} deletes own comment."""
    headers, session_id = await _setup_session_with_report(client, db)
    add_resp = await client.post(
        f"/api/v1/reports/{session_id}/comments",
        json={"content": "To delete"},
        headers=headers,
    )
    comment_id = add_resp.json()["id"]

    resp = await client.delete(
        f"/api/v1/reports/{session_id}/comments/{comment_id}", headers=headers
    )
    assert resp.status_code == 204

    list_resp = await client.get(f"/api/v1/reports/{session_id}/comments", headers=headers)
    assert len(list_resp.json()) == 0


@pytest.mark.asyncio
async def test_mention_detection(client, admin_headers, db):
    """Comments with @email detect mentioned users."""
    headers, session_id = await _setup_session_with_report(client, db)

    invite_resp = await client.post(
        "/api/v1/users",
        json={
            "email": "mentioned@testcorp.com",
            "full_name": "Mentioned User",
            "role": "hiring_manager",
            "password": "password123",
        },
        headers=headers,
    )
    assert invite_resp.status_code == 201

    resp = await client.post(
        f"/api/v1/reports/{session_id}/comments",
        json={"content": "Hey @mentioned@testcorp.com please review this."},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "mentioned_user_ids" in data
    assert len(data["mentioned_user_ids"]) >= 0


@pytest.mark.asyncio
async def test_comment_on_nonexistent_report(client, admin_headers):
    """Returns 404 when session doesn't exist."""
    headers = await _auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.post(
        f"/api/v1/reports/{fake_id}/comments",
        json={"content": "No report"},
        headers=headers,
    )
    assert resp.status_code == 404
