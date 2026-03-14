"""Tests for Interviewer Training Simulator endpoints."""

from unittest.mock import AsyncMock, patch
import uuid

import pytest

from tests.conftest import SIGNUP_PAYLOAD


async def _setup_user_and_org(client, db):
    """Sign up and return (org_id, user_id, headers)."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "training@test.com",
            "org_name": "Training Corp",
        },
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
    org_id = signup.json()["org_id"]
    # Get user_id from token sub - actually signup returns access_token, we need user from DB
    from jose import jwt
    from interviewbot.config import get_settings
    settings = get_settings()
    payload = jwt.decode(signup.json()["access_token"], settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    user_id = payload["sub"]
    return org_id, user_id, headers


@pytest.mark.asyncio
async def test_start_simulation(client, db):
    """Starting a simulation creates a TrainingSimulation."""
    _, _, headers = await _setup_user_and_org(client, db)

    resp = await client.post(
        "/api/v1/training/start",
        json={"role_type": "Software Engineer"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["role_type"] == "Software Engineer"
    assert data["status"] == "active"
    assert "id" in data
    assert "candidate_persona" in data
    assert data["candidate_persona"]["name"]
    assert data["messages"] == []


@pytest.mark.asyncio
async def test_start_simulation_with_persona(client, db):
    """Starting with explicit persona uses it."""
    _, _, headers = await _setup_user_and_org(client, db)

    persona = {
        "name": "Test Candidate",
        "experience_years": 3,
        "skill_level": "mid",
        "personality": "confident",
        "hidden_strengths": [],
        "hidden_weaknesses": [],
        "background": "Test background",
    }
    resp = await client.post(
        "/api/v1/training/start",
        json={"role_type": "PM", "persona": persona},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["candidate_persona"]["name"] == "Test Candidate"
    assert data["candidate_persona"]["background"] == "Test background"


@pytest.mark.asyncio
async def test_send_message(client, db):
    """Send message and get AI candidate response."""
    _, _, headers = await _setup_user_and_org(client, db)
    start_resp = await client.post(
        "/api/v1/training/start",
        json={"role_type": "Engineer"},
        headers=headers,
    )
    sim_id = start_resp.json()["id"]

    with patch(
        "interviewbot.services.training_engine.simulate_candidate_response",
        new_callable=AsyncMock,
        return_value="I have 5 years of Python experience.",
    ):
        resp = await client.post(
            f"/api/v1/training/{sim_id}/message",
            json={"content": "Tell me about your Python experience."},
            headers=headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["response"] == "I have 5 years of Python experience."

    get_resp = await client.get(f"/api/v1/training/{sim_id}", headers=headers)
    msgs = get_resp.json()["messages"]
    assert len(msgs) == 2
    assert msgs[0]["role"] == "interviewer"
    assert msgs[0]["content"] == "Tell me about your Python experience."
    assert msgs[1]["role"] == "candidate"
    assert msgs[1]["content"] == "I have 5 years of Python experience."


@pytest.mark.asyncio
async def test_end_simulation(client, db):
    """End simulation generates scorecard."""
    _, _, headers = await _setup_user_and_org(client, db)
    start_resp = await client.post(
        "/api/v1/training/start",
        json={"role_type": "Engineer"},
        headers=headers,
    )
    sim_id = start_resp.json()["id"]

    with patch(
        "interviewbot.services.training_engine.simulate_candidate_response",
        new_callable=AsyncMock,
        return_value="I have 5 years of experience.",
    ):
        await client.post(
            f"/api/v1/training/{sim_id}/message",
            json={"content": "Tell me about yourself."},
            headers=headers,
        )

    mock_scorecard = {
        "overall": 7.5,
        "question_quality": {"score": 8, "feedback": "Good"},
        "competency_coverage": {"score": 6, "feedback": "OK"},
        "bias_avoidance": {"score": 9, "feedback": "None"},
        "candidate_experience": {"score": 7, "feedback": "Good"},
        "depth_vs_breadth": {"score": 7, "feedback": "OK"},
        "time_management": {"score": 6, "feedback": "OK"},
        "tips": ["Tip 1", "Tip 2"],
    }
    with patch(
        "interviewbot.services.training_engine.score_interviewer",
        new_callable=AsyncMock,
        return_value=mock_scorecard,
    ):
        resp = await client.post(
            f"/api/v1/training/{sim_id}/end",
            headers=headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert data["scorecard"]["overall"] == 7.5
    assert data["duration_seconds"] is not None
    assert data["completed_at"] is not None


@pytest.mark.asyncio
async def test_get_simulation(client, db):
    """Get simulation by ID."""
    _, _, headers = await _setup_user_and_org(client, db)
    start_resp = await client.post(
        "/api/v1/training/start",
        json={"role_type": "Engineer"},
        headers=headers,
    )
    sim_id = start_resp.json()["id"]

    resp = await client.get(f"/api/v1/training/{sim_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == sim_id


@pytest.mark.asyncio
async def test_get_simulation_404(client, db):
    """Returns 404 for non-existent simulation."""
    _, _, headers = await _setup_user_and_org(client, db)
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/api/v1/training/{fake_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_history(client, db):
    """List user's training history."""
    _, _, headers = await _setup_user_and_org(client, db)
    await client.post(
        "/api/v1/training/start",
        json={"role_type": "Engineer"},
        headers=headers,
    )

    resp = await client.get("/api/v1/training/history", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["role_type"] == "Engineer"


@pytest.mark.asyncio
async def test_leaderboard(client, db):
    """Get org leaderboard."""
    _, _, headers = await _setup_user_and_org(client, db)
    start_resp = await client.post(
        "/api/v1/training/start",
        json={"role_type": "Engineer"},
        headers=headers,
    )
    sim_id = start_resp.json()["id"]

    with patch(
        "interviewbot.services.training_engine.score_interviewer",
        new_callable=AsyncMock,
        return_value={"overall": 8.0, "tips": []},
    ):
        await client.post(f"/api/v1/training/{sim_id}/end", headers=headers)

    resp = await client.get("/api/v1/training/leaderboard", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "full_name" in data[0]
    assert "avg_score" in data[0]
    assert "simulations_count" in data[0]


@pytest.mark.asyncio
async def test_personas(client, db):
    """List available personas."""
    _, _, headers = await _setup_user_and_org(client, db)

    resp = await client.get("/api/v1/training/personas", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "name" in data[0]
    assert "skill_level" in data[0]
    assert "personality" in data[0]


@pytest.mark.asyncio
async def test_random_persona(client, db):
    """Get random persona."""
    _, _, headers = await _setup_user_and_org(client, db)

    resp = await client.post("/api/v1/training/personas/random", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "name" in data
    assert "skill_level" in data
