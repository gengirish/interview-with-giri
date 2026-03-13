"""Tests for shareable report links with expiring public URLs."""

import uuid

import pytest

from interviewbot.models.tables import CandidateReport, InterviewSession, JobPosting
from tests.conftest import DEMO_ORG_ID


async def _create_session_with_report(db, org_id):
    """Create a completed interview session with a report."""
    job = JobPosting(
        org_id=org_id,
        title="Test Job",
        role_type="technical",
        job_description="Test description " * 10,
    )
    db.add(job)
    await db.flush()
    session = InterviewSession(
        job_posting_id=job.id,
        org_id=org_id,
        token="share-test-token",
        status="completed",
        candidate_name="Test Candidate",
    )
    db.add(session)
    await db.flush()
    report = CandidateReport(
        session_id=session.id,
        ai_summary="Good candidate",
        recommendation="hire",
        confidence_score=0.85,
    )
    db.add(report)
    await db.commit()
    return session, report


async def _setup_org_and_session_with_report(client, db):
    """Signup, create job, session with report. Returns (admin_headers, session_id)."""
    from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD

    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]
    link_resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    token = link_resp.json()["token"]
    await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "Share Tester", "candidate_email": "share@test.com"},
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
async def test_share_report_creates_token(client, db):
    """POST /reports/{id}/share creates a share token and returns URL."""
    headers, session_id = await _setup_org_and_session_with_report(client, db)
    resp = await client.post(f"/api/v1/reports/{session_id}/share", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "share_url" in data
    assert "share_token" in data
    assert "expires_at" in data
    assert data["share_token"] in data["share_url"]


@pytest.mark.asyncio
async def test_share_report_custom_expiry(client, db):
    """POST /reports/{id}/share?hours=24 sets custom expiry."""
    headers, session_id = await _setup_org_and_session_with_report(client, db)
    resp = await client.post(f"/api/v1/reports/{session_id}/share?hours=24", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "expires_at" in data
    from datetime import datetime

    expires = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
    now = datetime.now(datetime.UTC)
    diff_hours = (expires - now).total_seconds() / 3600
    assert 23 <= diff_hours <= 25


@pytest.mark.asyncio
async def test_public_report_accessible(client, db):
    """GET /reports/public/{token} returns report without auth."""
    from sqlalchemy import update

    from interviewbot.models.tables import Organization

    org = Organization(id=uuid.UUID(DEMO_ORG_ID), name="Test Org")
    db.add(org)
    await db.flush()
    _session, report = await _create_session_with_report(db, org.id)
    await db.execute(
        update(CandidateReport)
        .where(CandidateReport.id == report.id)
        .values(share_token="public-test-token", share_expires_at=None)
    )
    await db.commit()

    resp = await client.get("/api/v1/reports/public/public-test-token")
    assert resp.status_code == 200
    data = resp.json()
    assert data["candidate_name"] == "Test Candidate"
    assert data["ai_summary"] == "Good candidate"
    assert data["recommendation"] == "hire"


@pytest.mark.asyncio
async def test_public_report_expired(client, db):
    """GET /reports/public/{token} returns 410 for expired token."""
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import update

    from interviewbot.models.tables import Organization

    org = Organization(id=uuid.UUID(DEMO_ORG_ID), name="Test Org")
    db.add(org)
    await db.flush()
    _session, report = await _create_session_with_report(db, org.id)
    await db.execute(
        update(CandidateReport)
        .where(CandidateReport.id == report.id)
        .values(
            share_token="expired-token",
            share_expires_at=datetime.now(UTC) - timedelta(hours=1),
        )
    )
    await db.commit()

    resp = await client.get("/api/v1/reports/public/expired-token")
    assert resp.status_code == 410


@pytest.mark.asyncio
async def test_public_report_invalid_token(client):
    """GET /reports/public/invalid returns 404."""
    resp = await client.get("/api/v1/reports/public/invalid")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_share_report_viewer_forbidden(client, viewer_headers, db):
    """Viewers cannot share reports."""
    from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD

    signup = {
        **SIGNUP_PAYLOAD,
        "email": "share-viewer@testcorp.com",
    }
    resp = await client.post("/api/v1/auth/signup", json=signup)
    admin_h = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=admin_h)
    job_id = job_resp.json()["id"]
    link_resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=admin_h)
    token = link_resp.json()["token"]
    await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "V", "candidate_email": "v@test.com"},
    )
    list_resp = await client.get("/api/v1/interviews", headers=admin_h)
    session_id = list_resp.json()["items"][0]["id"]

    from sqlalchemy import update

    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == uuid.UUID(session_id))
        .values(status="completed", overall_score=8.0)
    )
    report = CandidateReport(
        session_id=uuid.UUID(session_id),
        ai_summary="x",
        recommendation="hire",
        confidence_score=0.8,
    )
    db.add(report)
    await db.commit()

    invite = await client.post(
        "/api/v1/users",
        json={
            "email": "viewer@share-test.com",
            "full_name": "Viewer",
            "role": "viewer",
            "password": "password123",
        },
        headers=admin_h,
    )
    assert invite.status_code == 201
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "viewer@share-test.com", "password": "password123"},
    )
    viewer_h = {"Authorization": f"Bearer {login.json()['access_token']}"}

    share_resp = await client.post(f"/api/v1/reports/{session_id}/share", headers=viewer_h)
    assert share_resp.status_code == 403
