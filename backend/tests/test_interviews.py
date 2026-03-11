"""E2E tests for interview session management and public candidate endpoints."""
import pytest

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _setup_job_with_link(client):
    """Signup, create job, generate link. Returns (headers, job_id, token)."""
    signup_resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    auth_token = signup_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {auth_token}"}

    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    link_resp = await client.post(
        f"/api/v1/job-postings/{job_id}/generate-link", headers=headers
    )
    interview_token = link_resp.json()["token"]
    return headers, job_id, interview_token


# --- Public interview endpoints ---


@pytest.mark.asyncio
async def test_get_public_interview_details(client):
    _, _, token = await _setup_job_with_link(client)
    resp = await client.get(f"/api/v1/interviews/public/{token}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["token"] == token
    assert data["status"] == "pending"
    assert data["format"] == "text"
    assert data["job_title"] == JOB_PAYLOAD["title"]
    assert "interview_config" in data


@pytest.mark.asyncio
async def test_get_public_interview_invalid_token_returns_404(client):
    resp = await client.get("/api/v1/interviews/public/nonexistent-token")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_start_public_interview(client):
    _, _, token = await _setup_job_with_link(client)
    resp = await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "Jane Doe", "candidate_email": "jane@example.com"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["token"] == token
    assert "WebSocket" in data["message"]


@pytest.mark.asyncio
async def test_start_interview_twice_returns_400(client):
    _, _, token = await _setup_job_with_link(client)
    await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "Jane Doe", "candidate_email": "jane@example.com"},
    )
    resp = await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "Jane Doe", "candidate_email": "jane@example.com"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_start_interview_missing_fields_returns_422(client):
    _, _, token = await _setup_job_with_link(client)
    resp = await client.post(f"/api/v1/interviews/public/{token}/start", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_start_interview_invalid_email_returns_422(client):
    _, _, token = await _setup_job_with_link(client)
    resp = await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "Jane", "candidate_email": "not-email"},
    )
    assert resp.status_code == 422


# --- Authenticated interview list ---


@pytest.mark.asyncio
async def test_list_interviews_empty(client):
    signup_resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    headers = {"Authorization": f"Bearer {signup_resp.json()['access_token']}"}
    resp = await client.get("/api/v1/interviews", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_list_interviews_shows_generated_sessions(client):
    headers, job_id, _ = await _setup_job_with_link(client)
    await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)

    resp = await client.get("/api/v1/interviews", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert all(s["status"] == "pending" for s in data["items"])


@pytest.mark.asyncio
async def test_list_interviews_filter_by_status(client):
    headers, job_id, token = await _setup_job_with_link(client)
    # Create a second session so we have pending + in_progress
    await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "Bob", "candidate_email": "bob@test.com"},
    )

    resp_pending = await client.get("/api/v1/interviews?status=pending", headers=headers)
    assert resp_pending.status_code == 200
    assert resp_pending.json()["total"] == 1

    resp_progress = await client.get(
        "/api/v1/interviews?status=in_progress", headers=headers
    )
    assert resp_progress.status_code == 200
    assert resp_progress.json()["total"] == 1


@pytest.mark.asyncio
async def test_get_interview_by_id(client):
    headers, _, token = await _setup_job_with_link(client)
    list_resp = await client.get("/api/v1/interviews", headers=headers)
    session_id = list_resp.json()["items"][0]["id"]

    resp = await client.get(f"/api/v1/interviews/{session_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == session_id
    assert resp.json()["token"] == token


@pytest.mark.asyncio
async def test_get_interview_messages_empty(client):
    headers, _, _ = await _setup_job_with_link(client)
    list_resp = await client.get("/api/v1/interviews", headers=headers)
    session_id = list_resp.json()["items"][0]["id"]

    resp = await client.get(f"/api/v1/interviews/{session_id}/messages", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_nonexistent_interview_returns_404(client):
    signup_resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    headers = {"Authorization": f"Bearer {signup_resp.json()['access_token']}"}
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"/api/v1/interviews/{fake_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_interviews_require_auth(client):
    resp = await client.get("/api/v1/interviews")
    assert resp.status_code in (401, 403)
