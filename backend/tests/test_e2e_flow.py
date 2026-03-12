"""E2E tests for the complete happy-path flow from signup to completed interview."""

from unittest.mock import AsyncMock, patch
import uuid

import pytest

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _auth_headers(client, email: str | None = None, org_name: str | None = None):
    payload = {
        **SIGNUP_PAYLOAD,
        "email": email or SIGNUP_PAYLOAD["email"],
        "org_name": org_name or SIGNUP_PAYLOAD["org_name"],
    }
    resp = await client.post("/api/v1/auth/signup", json=payload)
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, token


@pytest.mark.asyncio
@pytest.mark.smoke
async def test_full_interview_flow(client):
    headers, _ = await _auth_headers(client, "admin-flow1@test.com", "Flow1 Corp")

    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    assert job_resp.status_code == 201
    job_id = job_resp.json()["id"]

    link_resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    assert link_resp.status_code == 200
    interview_token = link_resp.json()["token"]

    public_resp = await client.get(f"/api/v1/interviews/public/{interview_token}")
    assert public_resp.status_code == 200
    assert public_resp.json()["job_title"] == JOB_PAYLOAD["title"]

    start_resp = await client.post(
        f"/api/v1/interviews/public/{interview_token}/start",
        json={"candidate_name": "Jane Doe", "candidate_email": "jane@example.com"},
    )
    assert start_resp.status_code == 200

    stats_resp = await client.get("/api/v1/dashboard/stats", headers=headers)
    assert stats_resp.status_code == 200
    assert stats_resp.json()["total_interviews"] >= 1

    list_resp = await client.get("/api/v1/interviews", headers=headers)
    assert list_resp.status_code == 200
    items = list_resp.json()["items"]
    assert len(items) >= 1
    session_id = items[0]["id"]

    detail_resp = await client.get(f"/api/v1/interviews/{session_id}", headers=headers)
    assert detail_resp.status_code == 200
    assert detail_resp.json()["candidate_name"] == "Jane Doe"
    assert detail_resp.json()["candidate_email"] == "jane@example.com"


@pytest.mark.asyncio
@pytest.mark.smoke
async def test_multi_role_workflow(client):
    admin_signup = {
        **SIGNUP_PAYLOAD,
        "email": "admin-multi@test.com",
        "org_name": "MultiRole Corp",
    }
    signup_resp = await client.post("/api/v1/auth/signup", json=admin_signup)
    assert signup_resp.status_code == 201
    admin_h = {"Authorization": f"Bearer {signup_resp.json()['access_token']}"}

    hm_invite = {
        "email": "hm-multi@test.com",
        "full_name": "Hiring Manager",
        "role": "hiring_manager",
        "password": "password123",
    }
    invite_resp = await client.post("/api/v1/users", json=hm_invite, headers=admin_h)
    assert invite_resp.status_code == 201

    login_hm = await client.post(
        "/api/v1/auth/login",
        json={"email": hm_invite["email"], "password": hm_invite["password"]},
    )
    assert login_hm.status_code == 200
    hm_h = {"Authorization": f"Bearer {login_hm.json()['access_token']}"}

    job_resp = await client.post(
        "/api/v1/job-postings",
        json={**JOB_PAYLOAD, "title": "HM Created Job"},
        headers=hm_h,
    )
    assert job_resp.status_code == 201
    job_id = job_resp.json()["id"]

    link_resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=hm_h)
    assert link_resp.status_code == 200

    admin_jobs = await client.get("/api/v1/job-postings", headers=admin_h)
    assert admin_jobs.status_code == 200
    assert admin_jobs.json()["total"] >= 1

    admin_interviews = await client.get("/api/v1/interviews", headers=admin_h)
    assert admin_interviews.status_code == 200
    assert admin_interviews.json()["total"] >= 1

    viewer_invite = {
        "email": "viewer-multi@test.com",
        "full_name": "Viewer User",
        "role": "viewer",
        "password": "password123",
    }
    await client.post("/api/v1/users", json=viewer_invite, headers=admin_h)

    login_v = await client.post(
        "/api/v1/auth/login",
        json={"email": viewer_invite["email"], "password": viewer_invite["password"]},
    )
    assert login_v.status_code == 200
    viewer_h = {"Authorization": f"Bearer {login_v.json()['access_token']}"}

    viewer_jobs = await client.get("/api/v1/job-postings", headers=viewer_h)
    assert viewer_jobs.status_code == 200

    create_job_resp = await client.post(
        "/api/v1/job-postings",
        json={**JOB_PAYLOAD, "title": "Viewer Tries Job"},
        headers=viewer_h,
    )
    assert create_job_resp.status_code == 403

    manage_users_resp = await client.post(
        "/api/v1/users",
        json={
            "email": "x@test.com",
            "full_name": "X",
            "role": "viewer",
            "password": "password123",
        },
        headers=viewer_h,
    )
    assert manage_users_resp.status_code == 403


@pytest.mark.asyncio
async def test_interview_link_lifecycle(client):
    headers, _ = await _auth_headers(client, "lifecycle@test.com", "Lifecycle Corp")
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]
    link_resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    interview_token = link_resp.json()["token"]

    public1 = await client.get(f"/api/v1/interviews/public/{interview_token}")
    assert public1.status_code == 200
    assert public1.json()["status"] == "pending"

    start1 = await client.post(
        f"/api/v1/interviews/public/{interview_token}/start",
        json={"candidate_name": "Bob", "candidate_email": "bob@test.com"},
    )
    assert start1.status_code == 200

    start2 = await client.post(
        f"/api/v1/interviews/public/{interview_token}/start",
        json={"candidate_name": "Bob", "candidate_email": "bob@test.com"},
    )
    assert start2.status_code == 200

    public2 = await client.get(f"/api/v1/interviews/public/{interview_token}")
    assert public2.status_code == 200
    assert public2.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_report_generation_and_export(client, db):
    headers, _ = await _auth_headers(client, "report@test.com", "Report Corp")
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]
    link_resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    interview_token = link_resp.json()["token"]

    await client.post(
        f"/api/v1/interviews/public/{interview_token}/start",
        json={"candidate_name": "Report Tester", "candidate_email": "report@test.com"},
    )

    list_resp = await client.get("/api/v1/interviews", headers=headers)
    session_id = list_resp.json()["items"][0]["id"]

    from sqlalchemy import update

    from interviewbot.models.tables import CandidateReport, InterviewMessage, InterviewSession

    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == uuid.UUID(session_id))
        .values(status="completed", overall_score=8.5)
    )
    msg1 = InterviewMessage(
        session_id=uuid.UUID(session_id),
        role="interviewer",
        content="Tell me about your experience.",
    )
    msg2 = InterviewMessage(
        session_id=uuid.UUID(session_id),
        role="candidate",
        content="I have 5 years of Python experience.",
    )
    db.add(msg1)
    db.add(msg2)
    await db.commit()

    async def _mock_score(sid, session_db):
        from sqlalchemy import select

        result = await session_db.execute(
            select(InterviewSession).where(InterviewSession.id == uuid.UUID(sid))
        )
        sess = result.scalar_one_or_none()
        if not sess:
            return None
        report = CandidateReport(
            session_id=sess.id,
            ai_summary="Strong candidate.",
            recommendation="hire",
            strengths=["Python"],
            concerns=[],
            confidence_score=0.85,
            skill_scores={"code_quality": {"score": 8.0, "evidence": "Good", "notes": ""}},
            behavioral_scores={"communication": {"score": 9.0, "evidence": "Clear", "notes": ""}},
            extended_data={
                "experience_level_assessment": "Senior",
                "hiring_level_fit": "L5",
                "suggested_follow_up_areas": [],
            },
        )
        session_db.add(report)
        await session_db.commit()
        await session_db.refresh(report)
        return report

    with patch(
        "interviewbot.routers.reports.score_interview",
        new_callable=AsyncMock,
        side_effect=_mock_score,
    ):
        gen_resp = await client.post(f"/api/v1/reports/{session_id}/generate", headers=headers)
    assert gen_resp.status_code in (200, 201)

    get_resp = await client.get(f"/api/v1/reports/{session_id}", headers=headers)
    assert get_resp.status_code == 200

    json_resp = await client.get(f"/api/v1/reports/{session_id}/export/json", headers=headers)
    assert json_resp.status_code == 200

    csv_resp = await client.get(f"/api/v1/reports/{session_id}/export/csv", headers=headers)
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]


@pytest.mark.asyncio
async def test_analytics_after_interviews(client):
    headers, _ = await _auth_headers(client, "analytics@test.com", "Analytics Corp")
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    link1 = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    link2 = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    token1 = link1.json()["token"]
    token2 = link2.json()["token"]

    await client.post(
        f"/api/v1/interviews/public/{token1}/start",
        json={"candidate_name": "A", "candidate_email": "a@test.com"},
    )
    await client.post(
        f"/api/v1/interviews/public/{token2}/start",
        json={"candidate_name": "B", "candidate_email": "b@test.com"},
    )

    stats_resp = await client.get("/api/v1/dashboard/stats", headers=headers)
    assert stats_resp.status_code == 200
    assert stats_resp.json()["total_interviews"] >= 2

    overview_resp = await client.get("/api/v1/analytics/overview", headers=headers)
    assert overview_resp.status_code == 200

    per_job_resp = await client.get("/api/v1/analytics/per-job", headers=headers)
    assert per_job_resp.status_code == 200
    jobs_data = per_job_resp.json()
    assert len(jobs_data) >= 1
    job_stats = next(j for j in jobs_data if j["job_id"] == job_id)
    assert job_stats["total_interviews"] >= 2


@pytest.mark.asyncio
async def test_org_isolation(client):
    signup_a = {
        **SIGNUP_PAYLOAD,
        "email": "org-a@test.com",
        "org_name": "Org A",
    }
    signup_b = {
        **SIGNUP_PAYLOAD,
        "email": "org-b@test.com",
        "org_name": "Org B",
    }

    resp_a = await client.post("/api/v1/auth/signup", json=signup_a)
    headers_a = {"Authorization": f"Bearer {resp_a.json()['access_token']}"}

    resp_b = await client.post("/api/v1/auth/signup", json=signup_b)
    headers_b = {"Authorization": f"Bearer {resp_b.json()['access_token']}"}

    job_a = await client.post(
        "/api/v1/job-postings",
        json={**JOB_PAYLOAD, "title": "Org A Job"},
        headers=headers_a,
    )
    job_a_id = job_a.json()["id"]

    job_b = await client.post(
        "/api/v1/job-postings",
        json={**JOB_PAYLOAD, "title": "Org B Job"},
        headers=headers_b,
    )
    job_b_id = job_b.json()["id"]

    list_a = await client.get("/api/v1/job-postings", headers=headers_a)
    assert list_a.status_code == 200
    assert all(j["id"] != job_b_id for j in list_a.json()["items"])

    list_b = await client.get("/api/v1/job-postings", headers=headers_b)
    assert list_b.status_code == 200
    assert all(j["id"] != job_a_id for j in list_b.json()["items"])

    access_b_job = await client.get(f"/api/v1/job-postings/{job_b_id}", headers=headers_a)
    assert access_b_job.status_code == 404
