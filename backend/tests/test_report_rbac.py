"""Tests for report generation/access RBAC."""

from unittest.mock import AsyncMock, patch
import uuid

import pytest

from interviewbot.models.tables import CandidateReport, InterviewSession
from tests.conftest import JOB_PAYLOAD


async def _setup_org_with_roles(client):
    """Create org with admin, hiring_manager, viewer. Returns (admin_h, hm_h, viewer_h)."""
    signup = {
        "org_name": "Report RBAC Corp",
        "full_name": "Admin",
        "email": "report-admin@test.com",
        "password": "password123",
    }
    resp = await client.post("/api/v1/auth/signup", json=signup)
    assert resp.status_code == 201
    admin_h = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    invite_hm = await client.post(
        "/api/v1/users",
        json={
            "email": "report-hm@test.com",
            "full_name": "HM",
            "role": "hiring_manager",
            "password": "password123",
        },
        headers=admin_h,
    )
    assert invite_hm.status_code == 201

    login_hm = await client.post(
        "/api/v1/auth/login",
        json={"email": "report-hm@test.com", "password": "password123"},
    )
    hm_h = {"Authorization": f"Bearer {login_hm.json()['access_token']}"}

    invite_v = await client.post(
        "/api/v1/users",
        json={
            "email": "report-viewer@test.com",
            "full_name": "Viewer",
            "role": "viewer",
            "password": "password123",
        },
        headers=admin_h,
    )
    assert invite_v.status_code == 201

    login_v = await client.post(
        "/api/v1/auth/login",
        json={"email": "report-viewer@test.com", "password": "password123"},
    )
    viewer_h = {"Authorization": f"Bearer {login_v.json()['access_token']}"}

    return admin_h, hm_h, viewer_h


async def _setup_session_with_report(client, db):
    """Create org, job, session, report. Returns (viewer_headers, session_id)."""
    admin_h, _, viewer_h = await _setup_org_with_roles(client)

    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=admin_h)
    job_id = job_resp.json()["id"]

    link_resp = await client.post(
        f"/api/v1/job-postings/{job_id}/generate-link",
        headers=admin_h,
    )
    token = link_resp.json()["token"]

    await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "Report Tester", "candidate_email": "report@test.com"},
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
        ai_summary="Good candidate.",
        recommendation="hire",
        strengths=["Python"],
        concerns=[],
        confidence_score=0.9,
        skill_scores={"python": {"score": 8, "evidence": "Solid", "notes": ""}},
        behavioral_scores={},
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return viewer_h, session_id


@pytest.mark.asyncio
async def test_viewer_can_read_report(client, db):
    """Viewer role can GET a report."""
    viewer_h, session_id = await _setup_session_with_report(client, db)

    resp = await client.get(f"/api/v1/reports/{session_id}", headers=viewer_h)
    assert resp.status_code == 200
    data = resp.json()
    assert data["candidate_name"] == "Report Tester"
    assert data["overall_score"] == 8.0
    assert "skill_scores" in data


@pytest.mark.asyncio
async def test_admin_can_generate_report(client, db):
    """Admin can POST to generate report (mock scoring engine)."""
    admin_h, _, _ = await _setup_org_with_roles(client)
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=admin_h)
    job_id = job_resp.json()["id"]

    link_resp = await client.post(
        f"/api/v1/job-postings/{job_id}/generate-link",
        headers=admin_h,
    )
    token = link_resp.json()["token"]

    await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "Gen Tester", "candidate_email": "gen@test.com"},
    )

    list_resp = await client.get("/api/v1/interviews", headers=admin_h)
    session_id = list_resp.json()["items"][0]["id"]

    from sqlalchemy import update

    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == uuid.UUID(session_id))
        .values(status="completed", overall_score=7.5)
    )
    await db.commit()

    mock_report = CandidateReport(
        session_id=uuid.UUID(session_id),
        ai_summary="Generated report.",
        recommendation="hire",
        strengths=[],
        concerns=[],
        confidence_score=0.85,
        skill_scores={},
        behavioral_scores={},
    )

    async def _fake_score(sid, session_db):
        session_db.add(mock_report)
        await session_db.commit()
        await session_db.refresh(mock_report)
        return mock_report

    with patch(
        "interviewbot.routers.reports.score_interview",
        new_callable=AsyncMock,
        side_effect=_fake_score,
    ):
        resp = await client.post(
            f"/api/v1/reports/{session_id}/generate",
            headers=admin_h,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["ai_summary"] == "Generated report."
    assert data["recommendation"] == "hire"


@pytest.mark.asyncio
async def test_generate_report_requires_auth(client):
    """POST generate report without auth returns 401."""
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.post(f"/api/v1/reports/{fake_id}/generate")
    assert resp.status_code in (401, 403)
