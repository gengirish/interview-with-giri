"""E2E tests for job posting CRUD and interview link generation."""
import pytest

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD

pytestmark = pytest.mark.smoke


async def _auth_headers(client) -> dict[str, str]:
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_job_posting(client):
    headers = await _auth_headers(client)
    resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == JOB_PAYLOAD["title"]
    assert data["role_type"] == "technical"
    assert data["interview_format"] == "text"
    assert data["is_active"] is True
    assert "id" in data
    assert "org_id" in data


@pytest.mark.asyncio
async def test_create_job_posting_missing_title_returns_422(client):
    headers = await _auth_headers(client)
    bad_payload = {**JOB_PAYLOAD, "title": ""}
    resp = await client.post("/api/v1/job-postings", json=bad_payload, headers=headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_job_posting_short_description_returns_422(client):
    headers = await _auth_headers(client)
    bad_payload = {**JOB_PAYLOAD, "job_description": "Too short"}
    resp = await client.post("/api/v1/job-postings", json=bad_payload, headers=headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_job_postings_empty(client):
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/job-postings", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


@pytest.mark.asyncio
async def test_list_job_postings_returns_created_jobs(client):
    headers = await _auth_headers(client)
    await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    second_job = {**JOB_PAYLOAD, "title": "Frontend Developer"}
    await client.post("/api/v1/job-postings", json=second_job, headers=headers)

    resp = await client.get("/api/v1/job-postings", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_list_job_postings_pagination(client):
    headers = await _auth_headers(client)
    for i in range(5):
        payload = {**JOB_PAYLOAD, "title": f"Job {i}"}
        await client.post("/api/v1/job-postings", json=payload, headers=headers)

    resp = await client.get("/api/v1/job-postings?page=1&per_page=2", headers=headers)
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2
    assert data["page"] == 1

    resp2 = await client.get("/api/v1/job-postings?page=3&per_page=2", headers=headers)
    data2 = resp2.json()
    assert len(data2["items"]) == 1


@pytest.mark.asyncio
async def test_get_job_posting_by_id(client):
    headers = await _auth_headers(client)
    create_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/job-postings/{job_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == job_id
    assert resp.json()["title"] == JOB_PAYLOAD["title"]


@pytest.mark.asyncio
async def test_get_nonexistent_job_returns_404(client):
    headers = await _auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"/api/v1/job-postings/{fake_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_job_posting(client):
    headers = await _auth_headers(client)
    create_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/job-postings/{job_id}",
        json={"title": "Updated Title", "is_active": False},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_delete_job_posting(client):
    headers = await _auth_headers(client)
    create_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/job-postings/{job_id}", headers=headers)
    assert resp.status_code == 204

    get_resp = await client.get(f"/api/v1/job-postings/{job_id}", headers=headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_generate_interview_link(client):
    headers = await _auth_headers(client)
    create_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = create_resp.json()["id"]

    resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["interview_url"].startswith("/interview/")
    assert data["token"] in data["interview_url"]


@pytest.mark.asyncio
async def test_generate_multiple_interview_links(client):
    headers = await _auth_headers(client)
    create_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = create_resp.json()["id"]

    resp1 = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    resp2 = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    assert resp1.json()["token"] != resp2.json()["token"]


@pytest.mark.asyncio
async def test_generate_link_nonexistent_job_returns_404(client):
    headers = await _auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.post(f"/api/v1/job-postings/{fake_id}/generate-link", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_job_posting_requires_auth(client):
    resp = await client.get("/api/v1/job-postings")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_job_posting_with_invalid_token(client):
    headers = {"Authorization": "Bearer invalid.jwt.token"}
    resp = await client.get("/api/v1/job-postings", headers=headers)
    assert resp.status_code == 401
