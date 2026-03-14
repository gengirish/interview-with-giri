"""Tests for Cultural Fit & Values Assessment API and engine."""

from unittest.mock import AsyncMock, patch
import uuid

import pytest
from sqlalchemy import select

from interviewbot.models.tables import (
    CompanyValues,
    InterviewMessage,
    InterviewSession,
    JobPosting,
    ValuesAssessment,
)
from interviewbot.services.values_engine import _extract_json, assess_values, generate_value_questions
from tests.conftest import DEMO_ORG_ID, JOB_PAYLOAD, SIGNUP_PAYLOAD


# --- Unit tests for values_engine ---


def test_extract_json_plain():
    """Plain JSON is returned as-is."""
    raw = '{"a": 1}'
    assert _extract_json(raw) == raw


def test_extract_json_markdown_block():
    """JSON inside ```json block is extracted."""
    raw = '```json\n{"a": 1, "b": 2}\n```'
    assert _extract_json(raw) == '{"a": 1, "b": 2}'


def test_extract_json_code_block_no_lang():
    """JSON inside ``` block without lang is extracted."""
    raw = '```\n{"x": 42}\n```'
    assert _extract_json(raw) == '{"x": 42}'


@pytest.mark.asyncio
async def test_generate_value_questions_mocked():
    """Question generation returns structured data when AI returns valid JSON."""
    mock_response = '[{"question": "Tell me about a time...", "probes": ["What happened?"]}]'
    with patch(
        "interviewbot.services.values_engine.AIEngine"
    ) as mock_engine_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value=mock_response)
        mock_engine_cls.return_value = mock_engine

        values = [
            {"name": "Ownership", "definition": "Taking responsibility", "behavioral_indicators": ["initiative"]},
        ]
        result = await generate_value_questions(values)
        assert "Ownership" in result
        assert len(result["Ownership"]) == 1
        assert result["Ownership"][0]["question"] == "Tell me about a time..."


@pytest.mark.asyncio
async def test_generate_value_questions_invalid_json():
    """Invalid JSON returns empty list for that value."""
    with patch(
        "interviewbot.services.values_engine.AIEngine"
    ) as mock_engine_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value="not valid json {{{")
        mock_engine_cls.return_value = mock_engine

        values = [{"name": "Integrity", "definition": "Honesty", "behavioral_indicators": []}]
        result = await generate_value_questions(values)
        assert result["Integrity"] == []


@pytest.mark.asyncio
async def test_assess_values_mocked():
    """Assessment returns value_scores, overall_fit_score, fit_label, narrative."""
    mock_response = """{
        "value_scores": {
            "Ownership": {"score": 7.5, "confidence": 0.8, "evidence": ["Candidate described taking initiative"]}
        },
        "overall_fit_score": 7.2,
        "fit_label": "Good Fit",
        "narrative": "The candidate demonstrated strong alignment with Ownership."
    }"""
    with patch(
        "interviewbot.services.values_engine.AIEngine"
    ) as mock_engine_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value=mock_response)
        mock_engine_cls.return_value = mock_engine

        values = [{"name": "Ownership", "definition": "Taking responsibility", "behavioral_indicators": []}]
        result = await assess_values(values, "Candidate: I took ownership of the project...")
        assert "value_scores" in result
        assert "Ownership" in result["value_scores"]
        assert result["value_scores"]["Ownership"]["score"] == 7.5
        assert result["overall_fit_score"] == 7.2
        assert result["fit_label"] == "Good Fit"
        assert "narrative" in result


@pytest.mark.asyncio
async def test_assess_values_fallback_on_parse_error():
    """Parse error returns fallback structure."""
    with patch(
        "interviewbot.services.values_engine.AIEngine"
    ) as mock_engine_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value="garbage {{{")
        mock_engine_cls.return_value = mock_engine

        result = await assess_values([], "transcript")
        assert result["value_scores"] == {}
        assert result["fit_label"] == "Unknown"
        assert "Assessment failed" in result["narrative"]


# --- API fixtures ---


async def _setup_org_values_and_session(client, db):
    """Create org, values, completed session with messages. Returns (session_id, org_id, headers)."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "values@test.com",
            "org_name": "Values Corp",
        },
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
    org_id = signup.json()["org_id"]

    # Set company values (admin)
    put_resp = await client.put(
        "/api/v1/values",
        json={
            "values": [
                {
                    "name": "Ownership",
                    "definition": "Taking responsibility",
                    "weight": 0.5,
                    "behavioral_indicators": ["initiative", "follow-through"],
                },
            ]
        },
        headers=headers,
    )
    assert put_resp.status_code == 200

    job = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    assert job.status_code == 201
    job_id = job.json()["id"]

    link = await client.post(
        f"/api/v1/job-postings/{job_id}/generate-link",
        headers=headers,
    )
    assert link.status_code == 200
    token = link.json()["token"]

    await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "Alice", "candidate_email": "alice@test.com"},
    )

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one()
    session.status = "completed"
    session.duration_seconds = 600
    db.add(session)

    for i, (role, content) in enumerate([
        ("interviewer", "Tell me about a project you led."),
        ("candidate", "I took ownership of our migration and ensured we delivered on time."),
    ]):
        msg = InterviewMessage(session_id=session.id, role=role, content=content)
        db.add(msg)

    await db.commit()
    await db.refresh(session)
    return str(session.id), org_id, headers


@pytest.mark.asyncio
async def test_get_values_empty(client, admin_headers):
    """GET /values returns null when no values configured."""
    # Use admin_headers with DEMO_ORG_ID - org may not exist, so we signup first
    signup = await client.post(
        "/api/v1/auth/signup",
        json={**SIGNUP_PAYLOAD, "email": "novalues@test.com", "org_name": "NoValues Corp"},
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    resp = await client.get("/api/v1/values", headers=headers)
    assert resp.status_code == 200
    assert resp.json() is None


@pytest.mark.asyncio
async def test_put_and_get_values(client, db):
    """PUT creates/updates values, GET returns them."""
    session_id, org_id, headers = await _setup_org_values_and_session(client, db)

    resp = await client.get("/api/v1/values", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data is not None
    assert len(data["values"]) == 1
    assert data["values"][0]["name"] == "Ownership"
    assert data["values"][0]["weight"] == 0.5


@pytest.mark.asyncio
async def test_put_values_requires_admin(client, db):
    """PUT /values requires admin role."""
    session_id, org_id, headers = await _setup_org_values_and_session(client, db)

    # Create hiring_manager token for same org
    from tests.conftest import _make_token
    hm_headers = {"Authorization": f"Bearer {_make_token('hiring_manager', org_id)}"}

    resp = await client.put(
        "/api/v1/values",
        json={"values": [{"name": "Test", "definition": "", "weight": 0.25, "behavioral_indicators": []}]},
        headers=hm_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_generate_questions_no_values(client):
    """Generate questions returns 400 when no values configured."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={**SIGNUP_PAYLOAD, "email": "noq@test.com", "org_name": "NoQ Corp"},
    )
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    resp = await client.post("/api/v1/values/generate-questions", headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_generate_questions_mocked(client, db):
    """Generate questions returns AI-generated questions."""
    session_id, org_id, headers = await _setup_org_values_and_session(client, db)

    mock_response = '[{"question": "Tell me about a time you took ownership.", "probes": ["What was the outcome?"]}]'
    with patch(
        "interviewbot.services.values_engine.AIEngine"
    ) as mock_engine_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value=mock_response)
        mock_engine_cls.return_value = mock_engine

        resp = await client.post("/api/v1/values/generate-questions", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "questions" in data
        assert "Ownership" in data["questions"]
        assert len(data["questions"]["Ownership"]) == 1


@pytest.mark.asyncio
async def test_assess_creates_assessment(client, db):
    """POST /assess creates ValuesAssessment and returns it."""
    session_id, org_id, headers = await _setup_org_values_and_session(client, db)

    mock_response = """{
        "value_scores": {"Ownership": {"score": 7.5, "confidence": 0.8, "evidence": ["Candidate showed initiative"]}},
        "overall_fit_score": 7.2,
        "fit_label": "Good Fit",
        "narrative": "Strong alignment with Ownership."
    }"""
    with patch(
        "interviewbot.services.values_engine.AIEngine"
    ) as mock_engine_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value=mock_response)
        mock_engine_cls.return_value = mock_engine

        resp = await client.post(f"/api/v1/values/assess/{session_id}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == session_id
        assert data["overall_fit_score"] == 7.2
        assert data["fit_label"] == "Good Fit"
        assert "Ownership" in data["value_scores"]


@pytest.mark.asyncio
async def test_get_assessment(client, db):
    """GET /assessment/{session_id} returns existing assessment."""
    session_id, org_id, headers = await _setup_org_values_and_session(client, db)

    mock_response = """{
        "value_scores": {"Ownership": {"score": 8, "confidence": 0.9, "evidence": []}},
        "overall_fit_score": 8,
        "fit_label": "Strong Fit",
        "narrative": "Excellent."
    }"""
    with patch(
        "interviewbot.services.values_engine.AIEngine"
    ) as mock_engine_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value=mock_response)
        mock_engine_cls.return_value = mock_engine

        await client.post(f"/api/v1/values/assess/{session_id}", headers=headers)

    resp = await client.get(f"/api/v1/values/assessment/{session_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["fit_label"] == "Strong Fit"


@pytest.mark.asyncio
async def test_get_assessment_404(client, db):
    """GET /assessment returns 404 when no assessment exists."""
    session_id, org_id, headers = await _setup_org_values_and_session(client, db)

    resp = await client.get(f"/api/v1/values/assessment/{session_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_org_trends(client, db):
    """GET /org-trends returns aggregate across assessments."""
    session_id, org_id, headers = await _setup_org_values_and_session(client, db)

    mock_response = """{
        "value_scores": {"Ownership": {"score": 7.5, "confidence": 0.8, "evidence": []}},
        "overall_fit_score": 7.5,
        "fit_label": "Good Fit",
        "narrative": "Good."
    }"""
    with patch(
        "interviewbot.services.values_engine.AIEngine"
    ) as mock_engine_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value=mock_response)
        mock_engine_cls.return_value = mock_engine

        await client.post(f"/api/v1/values/assess/{session_id}", headers=headers)

    resp = await client.get("/api/v1/values/org-trends", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["assessment_count"] == 1
    assert data["overall_avg_fit"] == 7.5
    assert "Ownership" in data["avg_value_scores"]


@pytest.mark.asyncio
async def test_org_trends_empty(client):
    """GET /org-trends returns zeros when no assessments."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={**SIGNUP_PAYLOAD, "email": "trends@test.com", "org_name": "Trends Corp"},
    )
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    resp = await client.get("/api/v1/values/org-trends", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["assessment_count"] == 0
    assert data["overall_avg_fit"] is None
    assert data["avg_value_scores"] == {}
