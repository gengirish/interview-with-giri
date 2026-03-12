"""E2E tests verifying rate-limited endpoints exist and respond."""

import pytest

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


@pytest.mark.asyncio
async def test_public_interview_endpoint_responds(client):
    """Public interview endpoint should work with valid token."""
    signup_resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    headers = {"Authorization": f"Bearer {signup_resp.json()['access_token']}"}

    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    link_resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    token = link_resp.json()["token"]

    response = await client.get(f"/api/v1/interviews/public/{token}")
    assert response.status_code == 200
    data = response.json()
    assert data["token"] == token
    assert "status" in data


@pytest.mark.asyncio
async def test_code_execution_endpoint_exists(client):
    """Code execution endpoint should exist and respond."""
    response = await client.post("/api/v1/code/execute", json={})
    assert response.status_code != 404
