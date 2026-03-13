"""Tests for Ask AI endpoint - natural language search across interviews."""

from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


@pytest.mark.asyncio
async def test_ask_ai_returns_answer(client, admin_headers):
    """Test Ask AI endpoint returns an answer."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "org_name": "AI Test Corp",
            "full_name": "Test User",
            "email": "askai@test.com",
            "password": "password123",
        },
    )
    assert signup.status_code == 201
    token = signup.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    job = await client.post(
        "/api/v1/job-postings",
        json={
            **JOB_PAYLOAD,
            "title": "Python Dev",
            "role_type": "technical",
            "job_description": (
                "A senior Python developer with experience in FastAPI, PostgreSQL, "
                "Docker, and cloud deployment. 5+ years."
            ),
            "required_skills": ["Python"],
            "interview_format": "text",
            "interview_config": {
                "num_questions": 5,
                "duration_minutes": 20,
                "difficulty": "medium",
                "include_coding": False,
            },
        },
        headers=headers,
    )
    assert job.status_code == 201
    job_id = job.json()["id"]

    link = await client.post(
        f"/api/v1/job-postings/{job_id}/generate-link",
        headers=headers,
    )
    assert link.status_code == 200
    interview_token = link.json()["token"]

    await client.post(
        f"/api/v1/interviews/public/{interview_token}/start",
        json={"candidate_name": "Alice", "candidate_email": "alice@test.com"},
    )

    with patch("interviewbot.routers.ai_ask.AIEngine") as mock_engine_cls:
        mock_engine = AsyncMock()
        mock_engine.chat.return_value = "Alice scored 9/10 on Python."
        mock_engine_cls.return_value = mock_engine

        resp = await client.post(
            "/api/v1/ai/ask",
            json={"query": "Who scored highest?"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "answer" in data
        assert "citations" in data
        assert "sessions_searched" in data


@pytest.mark.asyncio
async def test_ask_ai_requires_auth(client):
    resp = await client.post("/api/v1/ai/ask", json={"query": "test"})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_ask_ai_validates_query_length(client, admin_headers):
    resp = await client.post(
        "/api/v1/ai/ask",
        json={"query": "ab"},
        headers=admin_headers,
    )
    assert resp.status_code == 422
