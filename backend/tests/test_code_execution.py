"""E2E tests for code execution endpoint."""

import pytest

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


@pytest.mark.asyncio
async def test_code_execute_requires_interview_token(client):
    """Code execution without a valid token should fail."""
    response = await client.post(
        "/api/v1/code/execute",
        json={
            "source_code": "print('hello')",
            "language": "python",
            "interview_token": "invalid-token",
        },
    )
    assert response.status_code in (400, 401, 403, 404, 422)


@pytest.mark.asyncio
async def test_code_execute_with_valid_session(client):
    """Code execution with valid session returns result or error when Judge0 not configured."""
    signup_resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    headers = {"Authorization": f"Bearer {signup_resp.json()['access_token']}"}

    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    link_resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    interview_token = link_resp.json()["token"]

    await client.post(
        f"/api/v1/interviews/public/{interview_token}/start",
        json={"candidate_name": "Code Test", "candidate_email": "code@test.com"},
    )

    response = await client.post(
        "/api/v1/code/execute",
        json={
            "source_code": "print('hello')",
            "language": "python",
            "interview_token": interview_token,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "stdout" in data
    assert "stderr" in data
    assert "status" in data
