"""Tests for extract-skills endpoint POST /api/v1/job-postings/{id}/extract-skills."""

from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _auth_headers(client):
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.mark.asyncio
async def test_extract_skills_success(client):
    """Create job, POST extract-skills with mocked AIEngine, verify response structure."""
    headers = await _auth_headers(client)
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    assert job_resp.status_code == 201
    job_id = job_resp.json()["id"]

    mock_result = '{"technical_skills": ["Python", "FastAPI"], "soft_skills": ["communication"]}'
    mock_engine = AsyncMock()
    mock_engine.chat = AsyncMock(return_value=mock_result)

    with patch("interviewbot.services.ai_engine.AIEngine", return_value=mock_engine):
        resp = await client.post(
            f"/api/v1/job-postings/{job_id}/extract-skills",
            headers=headers,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "technical_skills" in data
    assert "soft_skills" in data
    assert data["technical_skills"] == ["Python", "FastAPI"]
    assert data["soft_skills"] == ["communication"]


@pytest.mark.asyncio
async def test_extract_skills_requires_auth(client):
    """POST extract-skills without auth returns 401."""
    headers = await _auth_headers(client)
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    resp = await client.post(f"/api/v1/job-postings/{job_id}/extract-skills")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_extract_skills_nonexistent_job(client):
    """POST extract-skills with non-existent job ID returns 404."""
    headers = await _auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"

    resp = await client.post(
        f"/api/v1/job-postings/{fake_id}/extract-skills",
        headers=headers,
    )
    assert resp.status_code == 404
