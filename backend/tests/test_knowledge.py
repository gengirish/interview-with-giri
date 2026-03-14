"""Tests for Organizational Hiring Knowledge Base API and engine."""

from unittest.mock import AsyncMock, patch
import uuid

import pytest
from sqlalchemy import select

from interviewbot.models.tables import (
    CandidateReport,
    InterviewSession,
    JobPosting,
    KnowledgeEntry,
    KnowledgeQueryLog,
    Organization,
    User,
)
from interviewbot.services.knowledge_engine import (
    extract_knowledge,
    generate_suggestions,
    query_knowledge,
)
from tests.conftest import DEMO_ORG_ID, JOB_PAYLOAD, SIGNUP_PAYLOAD, _make_token


# --- Unit tests for knowledge_engine ---


@pytest.mark.asyncio
async def test_extract_knowledge_mocked():
    """Knowledge extraction returns list of entries when AI returns valid JSON."""
    mock_response = """[
        {"category": "question_insight", "title": "System Design Predicts Success",
         "content": "Candidates scoring 8+ on system design had 78% hire rate.", "confidence": 0.85,
         "tags": ["system_design"]}
    ]"""
    with patch("interviewbot.services.knowledge_engine.AIEngine") as mock_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value=mock_response)
        mock_cls.return_value = mock_engine

        data = [
            {"session_id": "s1", "candidate_name": "Alice", "overall_score": 8.5},
            {"session_id": "s2", "candidate_name": "Bob", "overall_score": 7.2},
        ]
        result = await extract_knowledge(data, "technical")
        assert len(result) == 1
        assert result[0]["category"] == "question_insight"
        assert result[0]["title"] == "System Design Predicts Success"
        assert result[0]["confidence"] == 0.85


@pytest.mark.asyncio
async def test_extract_knowledge_invalid_json():
    """Invalid JSON returns empty list."""
    with patch("interviewbot.services.knowledge_engine.AIEngine") as mock_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value="not valid json {{{")
        mock_cls.return_value = mock_engine

        result = await extract_knowledge([{"x": 1}], "technical")
        assert result == []


@pytest.mark.asyncio
async def test_query_knowledge_mocked():
    """Query returns answer from AI."""
    with patch("interviewbot.services.knowledge_engine.AIEngine") as mock_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(
            return_value="Your pass rate for React roles is 72%. Consider adding more system design questions."
        )
        mock_cls.return_value = mock_engine

        entries = [
            {"category": "question_insight", "title": "React roles", "content": "Pass rate 72%"},
        ]
        stats = {"total_interviews": 50, "avg_score": 7.2, "pass_rate": 65, "top_roles": ["technical"]}
        result = await query_knowledge("What's our pass rate for React?", entries, stats)
        assert "72%" in result or "pass rate" in result.lower()


@pytest.mark.asyncio
async def test_generate_suggestions_mocked():
    """Suggestions returns list when AI returns valid JSON."""
    mock_response = """[
        {"title": "Pass rate dropped", "detail": "Consider revisiting questions", "type": "warning"}
    ]"""
    with patch("interviewbot.services.knowledge_engine.AIEngine") as mock_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value=mock_response)
        mock_cls.return_value = mock_engine

        stats = {"total_interviews": 20, "avg_score": 7.0, "pass_rate": 70, "top_roles": ["technical"]}
        result = await generate_suggestions(stats)
        assert len(result) == 1
        assert result[0]["title"] == "Pass rate dropped"
        assert result[0]["type"] == "warning"


@pytest.mark.asyncio
async def test_generate_suggestions_invalid_json():
    """Invalid JSON returns empty list."""
    with patch("interviewbot.services.knowledge_engine.AIEngine") as mock_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value="garbage")
        mock_cls.return_value = mock_engine

        result = await generate_suggestions({})
        assert result == []


# --- API fixtures ---


async def _setup_org_and_knowledge(client, db):
    """Create org, user, knowledge entries. Returns (org_id, user_id, headers)."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "knowledge@test.com",
            "org_name": "Knowledge Corp",
        },
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
    org_id = uuid.UUID(signup.json()["org_id"])
    user_id = uuid.UUID(signup.json().get("user_id", "00000000-0000-0000-0000-000000000001"))

    # Create knowledge entry directly
    entry = KnowledgeEntry(
        org_id=org_id,
        category="question_insight",
        title="System Design Questions Work Best",
        content="Candidates who scored above 8 on system design had 78% hire rate.",
        source_data={"role_type": "technical"},
        confidence=0.85,
        tags=["system_design", "prediction"],
        is_auto_generated=True,
    )
    db.add(entry)
    await db.commit()
    return org_id, user_id, headers


async def _setup_org_with_completed_interviews(client, db):
    """Create org with completed interviews and reports for generate endpoint."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "gen@test.com",
            "org_name": "Gen Corp",
        },
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
    org_id = uuid.UUID(signup.json()["org_id"])

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
    session.overall_score = 8.0
    session.duration_seconds = 600
    db.add(session)

    report = CandidateReport(
        session_id=session.id,
        recommendation="hire",
        ai_summary="Strong candidate with good system design skills.",
        skill_scores={},
        behavioral_scores={},
        strengths=["system design"],
        concerns=[],
    )
    db.add(report)
    await db.commit()
    return org_id, headers


# --- API tests ---


@pytest.mark.asyncio
async def test_query_knowledge(client, db):
    """POST /knowledge/query returns answer and sources."""
    _, _, headers = await _setup_org_and_knowledge(client, db)

    with patch("interviewbot.services.knowledge_engine.AIEngine") as mock_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(
            return_value="System design questions correlate with hire success. Your pass rate is strong."
        )
        mock_cls.return_value = mock_engine

        resp = await client.post(
            "/api/v1/knowledge/query",
            json={"query": "What questions work best for senior engineers?"},
            headers=headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "answer" in data
    assert "sources" in data
    assert "query_id" in data


@pytest.mark.asyncio
async def test_query_empty(client, db):
    """POST /knowledge/query with empty query returns 400."""
    _, _, headers = await _setup_org_and_knowledge(client, db)

    resp = await client.post(
        "/api/v1/knowledge/query",
        json={"query": ""},
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_entries(client, db):
    """GET /knowledge/entries returns entries."""
    _, _, headers = await _setup_org_and_knowledge(client, db)

    resp = await client.get("/api/v1/knowledge/entries", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert len(data["items"]) >= 1
    assert data["items"][0]["category"] == "question_insight"
    assert data["items"][0]["title"] == "System Design Questions Work Best"


@pytest.mark.asyncio
async def test_list_entries_filter_category(client, db):
    """GET /knowledge/entries?category= filters by category."""
    _, _, headers = await _setup_org_and_knowledge(client, db)

    resp = await client.get(
        "/api/v1/knowledge/entries?category=question_insight",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert all(e["category"] == "question_insight" for e in data["items"])


@pytest.mark.asyncio
async def test_get_entry(client, db):
    """GET /knowledge/entries/{id} returns single entry."""
    _, _, headers = await _setup_org_and_knowledge(client, db)

    list_resp = await client.get("/api/v1/knowledge/entries", headers=headers)
    assert list_resp.status_code == 200
    entry_id = list_resp.json()["items"][0]["id"]

    resp = await client.get(f"/api/v1/knowledge/entries/{entry_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == entry_id
    assert resp.json()["title"] == "System Design Questions Work Best"


@pytest.mark.asyncio
async def test_get_entry_404(client, db):
    """GET /knowledge/entries/{id} returns 404 for unknown."""
    _, _, headers = await _setup_org_and_knowledge(client, db)

    resp = await client.get(
        f"/api/v1/knowledge/entries/{uuid.uuid4()}",
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_generate_knowledge(client, db):
    """POST /knowledge/generate creates entries from completed interviews."""
    _, headers = await _setup_org_with_completed_interviews(client, db)

    with patch("interviewbot.services.knowledge_engine.AIEngine") as mock_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(
            return_value='[{"category":"question_insight","title":"Test","content":"Test content","confidence":0.8,"tags":[]}]'
        )
        mock_cls.return_value = mock_engine

        resp = await client.post("/api/v1/knowledge/generate", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "entries_created" in data


@pytest.mark.asyncio
async def test_generate_requires_admin(client, db):
    """POST /knowledge/generate requires admin role."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={**SIGNUP_PAYLOAD, "email": "viewer@test.com", "org_name": "View Corp"},
    )
    assert signup.status_code == 201
    org_id = signup.json()["org_id"]
    viewer_token = _make_token("viewer", org_id=org_id)
    headers = {"Authorization": f"Bearer {viewer_token}"}

    resp = await client.post("/api/v1/knowledge/generate", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_suggestions(client, db):
    """GET /knowledge/suggestions returns suggestions."""
    _, _, headers = await _setup_org_and_knowledge(client, db)

    with patch("interviewbot.services.knowledge_engine.AIEngine") as mock_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(
            return_value='[{"title":"Insight 1","detail":"Detail 1","type":"info"}]'
        )
        mock_cls.return_value = mock_engine

        resp = await client.get("/api/v1/knowledge/suggestions", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "suggestions" in data
    assert isinstance(data["suggestions"], list)


@pytest.mark.asyncio
async def test_rate_query(client, db):
    """POST /knowledge/query/{id}/rate updates rating."""
    _, _, headers = await _setup_org_and_knowledge(client, db)

    with patch("interviewbot.services.knowledge_engine.AIEngine") as mock_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value="Test answer")
        mock_cls.return_value = mock_engine

        query_resp = await client.post(
            "/api/v1/knowledge/query",
            json={"query": "What works best?"},
            headers=headers,
        )
    assert query_resp.status_code == 200
    query_id = query_resp.json()["query_id"]
    assert query_id

    resp = await client.post(
        f"/api/v1/knowledge/query/{query_id}/rate",
        json={"rating": 5},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["rating"] == 5


@pytest.mark.asyncio
async def test_popular_queries(client, db):
    """GET /knowledge/popular-queries returns grouped queries."""
    _, _, headers = await _setup_org_and_knowledge(client, db)

    with patch("interviewbot.services.knowledge_engine.AIEngine") as mock_cls:
        mock_engine = AsyncMock()
        mock_engine.chat = AsyncMock(return_value="Answer")
        mock_cls.return_value = mock_engine

        await client.post(
            "/api/v1/knowledge/query",
            json={"query": "pass rate"},
            headers=headers,
        )
        await client.post(
            "/api/v1/knowledge/query",
            json={"query": "pass rate"},
            headers=headers,
        )

    resp = await client.get("/api/v1/knowledge/popular-queries", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "queries" in data
    assert len(data["queries"]) >= 1
    assert data["queries"][0]["query"] == "pass rate"
    assert data["queries"][0]["count"] >= 2
