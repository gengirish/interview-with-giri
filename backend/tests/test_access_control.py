"""E2E tests for auth guards, tenant isolation, and public endpoint access."""
import pytest

from tests.conftest import JOB_PAYLOAD

pytestmark = pytest.mark.smoke


SIGNUP_A = {
    "org_name": "Org Alpha",
    "full_name": "Alice",
    "email": "alice@alpha.com",
    "password": "password123",
}

SIGNUP_B = {
    "org_name": "Org Beta",
    "full_name": "Bob",
    "email": "bob@beta.com",
    "password": "password123",
}


# --- Tenant isolation ---


@pytest.mark.asyncio
async def test_org_a_cannot_see_org_b_jobs(client):
    resp_a = await client.post("/api/v1/auth/signup", json=SIGNUP_A)
    headers_a = {"Authorization": f"Bearer {resp_a.json()['access_token']}"}

    resp_b = await client.post("/api/v1/auth/signup", json=SIGNUP_B)
    headers_b = {"Authorization": f"Bearer {resp_b.json()['access_token']}"}

    await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers_a)

    resp = await client.get("/api/v1/job-postings", headers=headers_b)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_org_a_cannot_access_org_b_job_by_id(client):
    resp_a = await client.post("/api/v1/auth/signup", json=SIGNUP_A)
    headers_a = {"Authorization": f"Bearer {resp_a.json()['access_token']}"}

    resp_b = await client.post("/api/v1/auth/signup", json=SIGNUP_B)
    headers_b = {"Authorization": f"Bearer {resp_b.json()['access_token']}"}

    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers_a)
    job_id = job_resp.json()["id"]

    resp = await client.get(f"/api/v1/job-postings/{job_id}", headers=headers_b)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_org_a_cannot_delete_org_b_job(client):
    resp_a = await client.post("/api/v1/auth/signup", json=SIGNUP_A)
    headers_a = {"Authorization": f"Bearer {resp_a.json()['access_token']}"}

    resp_b = await client.post("/api/v1/auth/signup", json=SIGNUP_B)
    headers_b = {"Authorization": f"Bearer {resp_b.json()['access_token']}"}

    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers_a)
    job_id = job_resp.json()["id"]

    resp = await client.delete(f"/api/v1/job-postings/{job_id}", headers=headers_b)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_org_isolation_on_interviews(client):
    resp_a = await client.post("/api/v1/auth/signup", json=SIGNUP_A)
    headers_a = {"Authorization": f"Bearer {resp_a.json()['access_token']}"}

    resp_b = await client.post("/api/v1/auth/signup", json=SIGNUP_B)
    headers_b = {"Authorization": f"Bearer {resp_b.json()['access_token']}"}

    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers_a)
    job_id = job_resp.json()["id"]
    await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers_a)

    resp = await client.get("/api/v1/interviews", headers=headers_b)
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_org_isolation_on_dashboard(client):
    resp_a = await client.post("/api/v1/auth/signup", json=SIGNUP_A)
    headers_a = {"Authorization": f"Bearer {resp_a.json()['access_token']}"}

    resp_b = await client.post("/api/v1/auth/signup", json=SIGNUP_B)
    headers_b = {"Authorization": f"Bearer {resp_b.json()['access_token']}"}

    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers_a)
    job_id = job_resp.json()["id"]
    await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers_a)

    stats_b = await client.get("/api/v1/dashboard/stats", headers=headers_b)
    assert stats_b.json()["total_interviews"] == 0
    assert stats_b.json()["active_jobs"] == 0


# --- Auth guards ---


PROTECTED_ENDPOINTS = [
    ("GET", "/api/v1/job-postings"),
    ("GET", "/api/v1/interviews"),
    ("GET", "/api/v1/dashboard/stats"),
    ("GET", "/api/v1/analytics/overview"),
    ("GET", "/api/v1/analytics/per-job"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", PROTECTED_ENDPOINTS)
async def test_protected_endpoints_reject_no_auth(client, method, path):
    resp = await client.request(method, path)
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", PROTECTED_ENDPOINTS)
async def test_protected_endpoints_reject_bad_token(client, method, path):
    headers = {"Authorization": "Bearer garbage.token.here"}
    resp = await client.request(method, path, headers=headers)
    assert resp.status_code == 401


# --- Public endpoints ---


PUBLIC_ENDPOINTS = [
    ("GET", "/api/v1/health"),
    ("GET", "/api/v1/health/db"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", PUBLIC_ENDPOINTS)
async def test_public_endpoints_need_no_auth(client, method, path):
    resp = await client.request(method, path)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_public_interview_endpoint_needs_no_auth(client):
    resp_a = await client.post("/api/v1/auth/signup", json=SIGNUP_A)
    headers = {"Authorization": f"Bearer {resp_a.json()['access_token']}"}
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    link_resp = await client.post(
        f"/api/v1/job-postings/{job_resp.json()['id']}/generate-link", headers=headers
    )
    token = link_resp.json()["token"]

    resp = await client.get(f"/api/v1/interviews/public/{token}")
    assert resp.status_code == 200
