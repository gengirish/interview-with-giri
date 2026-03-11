"""E2E tests for dashboard stats and analytics endpoints."""
import pytest

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _auth_headers(client) -> dict[str, str]:
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.mark.asyncio
async def test_dashboard_stats_empty_org(client):
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/dashboard/stats", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_interviews"] == 0
    assert data["completed_interviews"] == 0
    assert data["active_jobs"] == 0
    assert data["avg_score"] is None
    assert data["interviews_this_month"] == 0
    assert data["pass_rate"] is None


@pytest.mark.asyncio
async def test_dashboard_stats_counts_jobs_and_interviews(client):
    headers = await _auth_headers(client)
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]
    await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)

    resp = await client.get("/api/v1/dashboard/stats", headers=headers)
    data = resp.json()
    assert data["active_jobs"] == 1
    assert data["total_interviews"] == 2
    assert data["interviews_this_month"] == 2


@pytest.mark.asyncio
async def test_dashboard_stats_requires_auth(client):
    resp = await client.get("/api/v1/dashboard/stats")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_analytics_overview_returns_200(client):
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/analytics/overview", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_analytics_per_job_returns_200(client):
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/analytics/per-job", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_analytics_requires_auth(client):
    resp = await client.get("/api/v1/analytics/overview")
    assert resp.status_code in (401, 403)
