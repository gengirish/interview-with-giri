"""Tests for Interview Clip Studio API and engine."""

import json
from unittest.mock import AsyncMock, patch
import uuid

import pytest
from sqlalchemy import select

from interviewbot.models.tables import (
    ClipCollection,
    InterviewClip,
    InterviewMessage,
    InterviewSession,
    JobPosting,
    Organization,
    User,
)
from interviewbot.services.clip_engine import extract_clips
from tests.conftest import DEMO_ORG_ID, JOB_PAYLOAD, SIGNUP_PAYLOAD


# --- Unit tests for clip_engine ---


@pytest.mark.asyncio
async def test_extract_clips_returns_list():
    """extract_clips returns a list of clip dicts from AI response."""
    messages = [
        {"role": "interviewer", "content": "Tell me about your experience."},
        {"role": "candidate", "content": "I have 5 years of Python experience."},
    ]
    with patch("interviewbot.services.clip_engine.AIEngine") as mock_engine:
        mock_engine.return_value.chat = AsyncMock(
            return_value='[{"category":"best_answer","title":"Strong experience","description":"Good","start_index":1,"end_index":1,"importance":0.9}]'
        )
        result = await extract_clips(messages, "Senior Engineer")
        assert len(result) == 1
        assert result[0]["category"] == "best_answer"
        assert result[0]["title"] == "Strong experience"
        assert result[0]["importance"] == 0.9


@pytest.mark.asyncio
async def test_extract_clips_handles_invalid_json():
    """extract_clips returns empty list on parse error."""
    with patch("interviewbot.services.clip_engine.AIEngine") as mock_engine:
        mock_engine.return_value.chat = AsyncMock(return_value="not valid json")
        result = await extract_clips([], "Job")
        assert result == []


# --- API fixtures ---


async def _setup_org_job_session_messages(client, db):
    """Create org, user, job, completed session with messages. Returns (session_id, headers)."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "clips@test.com",
            "org_name": "Clips Corp",
        },
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
    org_id = uuid.UUID(signup.json()["org_id"])

    job_resp = await client.post(
        "/api/v1/job-postings",
        json=JOB_PAYLOAD,
        headers=headers,
    )
    assert job_resp.status_code == 201
    job_id = job_resp.json()["id"]

    # Create session directly in DB (no public start flow)
    session = InterviewSession(
        job_posting_id=uuid.UUID(job_id),
        org_id=org_id,
        token="test-token-clips-123",
        candidate_name="Alice",
        candidate_email="alice@test.com",
        status="completed",
        format="text",
    )
    db.add(session)
    await db.flush()
    for i in range(4):
        msg = InterviewMessage(
            session_id=session.id,
            role="interviewer" if i % 2 == 0 else "candidate",
            content=f"Message {i} content",
        )
        db.add(msg)
    await db.commit()
    await db.refresh(session)
    return str(session.id), headers


# --- API tests ---


@pytest.mark.asyncio
async def test_get_session_clips_empty(client, db):
    """Get clips for session returns empty list when none exist."""
    session_id, headers = await _setup_org_job_session_messages(client, db)
    resp = await client.get(
        f"/api/v1/clips/session/{session_id}",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_generate_clips(client, db):
    """Generate clips creates clips from AI extraction."""
    session_id, headers = await _setup_org_job_session_messages(client, db)
    mock_clips = [
        {
            "category": "best_answer",
            "title": "Strong Python answer",
            "description": "Demonstrated expertise",
            "start_index": 1,
            "end_index": 2,
            "importance": 0.95,
        },
    ]
    with patch("interviewbot.services.clip_engine.AIEngine") as mock_engine:
        mock_engine.return_value.chat = AsyncMock(
            return_value=json.dumps(mock_clips)
        )
        resp = await client.post(
            f"/api/v1/clips/generate/{session_id}",
            headers=headers,
        )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) == 1
    clip = resp.json()[0]
    assert clip["clip_type"] == "best_answer"
    assert clip["title"] == "Strong Python answer"
    assert clip["importance_score"] == 0.95


@pytest.mark.asyncio
async def test_get_clip(client, db):
    """Get single clip by ID."""
    session_id, headers = await _setup_org_job_session_messages(client, db)
    with patch("interviewbot.services.clip_engine.AIEngine") as mock_engine:
        mock_engine.return_value.chat = AsyncMock(
            return_value='[{"category":"key_insight","title":"Insight","description":"x","start_index":0,"end_index":1,"importance":0.8}]'
        )
        gen = await client.post(
            f"/api/v1/clips/generate/{session_id}",
            headers=headers,
        )
    assert gen.status_code == 200
    clip_id = gen.json()[0]["id"]
    resp = await client.get(f"/api/v1/clips/{clip_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == clip_id


@pytest.mark.asyncio
async def test_delete_clip(client, db):
    """Delete clip removes it."""
    session_id, headers = await _setup_org_job_session_messages(client, db)
    with patch("interviewbot.services.clip_engine.AIEngine") as mock_engine:
        mock_engine.return_value.chat = AsyncMock(
            return_value='[{"category":"red_flag","title":"Flag","description":"x","start_index":0,"end_index":0,"importance":0.7}]'
        )
        gen = await client.post(
            f"/api/v1/clips/generate/{session_id}",
            headers=headers,
        )
    clip_id = gen.json()[0]["id"]
    resp = await client.delete(f"/api/v1/clips/{clip_id}", headers=headers)
    assert resp.status_code == 204
    get_resp = await client.get(f"/api/v1/clips/{clip_id}", headers=headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_share_clip(client, db):
    """Share clip generates token and URL."""
    session_id, headers = await _setup_org_job_session_messages(client, db)
    with patch("interviewbot.services.clip_engine.AIEngine") as mock_engine:
        mock_engine.return_value.chat = AsyncMock(
            return_value='[{"category":"best_answer","title":"Share me","description":"x","start_index":0,"end_index":0,"importance":0.9}]'
        )
        gen = await client.post(
            f"/api/v1/clips/generate/{session_id}",
            headers=headers,
        )
    clip_id = gen.json()[0]["id"]
    resp = await client.post(
        f"/api/v1/clips/{clip_id}/share?hours=24",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "share_url" in data
    assert "share_token" in data
    assert "expires_at" in data
    assert "/clips/" in data["share_url"]


@pytest.mark.asyncio
async def test_get_public_clip(client, db):
    """Public clip endpoint returns clip without auth."""
    session_id, headers = await _setup_org_job_session_messages(client, db)
    with patch("interviewbot.services.clip_engine.AIEngine") as mock_engine:
        mock_engine.return_value.chat = AsyncMock(
            return_value='[{"category":"best_answer","title":"Public clip","description":"Public","start_index":0,"end_index":0,"importance":0.85}]'
        )
        gen = await client.post(
            f"/api/v1/clips/generate/{session_id}",
            headers=headers,
        )
    clip_id = gen.json()[0]["id"]
    share_resp = await client.post(
        f"/api/v1/clips/{clip_id}/share",
        headers=headers,
    )
    token = share_resp.json()["share_token"]
    resp = await client.get(f"/api/v1/clips/public/{token}")
    assert resp.status_code == 200
    assert resp.json()["title"] == "Public clip"


@pytest.mark.asyncio
async def test_list_clips(client, db):
    """List all clips with optional filters."""
    session_id, headers = await _setup_org_job_session_messages(client, db)
    with patch("interviewbot.services.clip_engine.AIEngine") as mock_engine:
        mock_engine.return_value.chat = AsyncMock(
            return_value='[{"category":"best_answer","title":"Listed","description":"x","start_index":0,"end_index":0,"importance":0.9}]'
        )
        await client.post(
            f"/api/v1/clips/generate/{session_id}",
            headers=headers,
        )
    resp = await client.get("/api/v1/clips", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
    resp2 = await client.get("/api/v1/clips?type=best_answer", headers=headers)
    assert resp2.status_code == 200


@pytest.mark.asyncio
async def test_create_clip_collection(client, db):
    """Create clip collection."""
    session_id, headers = await _setup_org_job_session_messages(client, db)
    with patch("interviewbot.services.clip_engine.AIEngine") as mock_engine:
        mock_engine.return_value.chat = AsyncMock(
            return_value='[{"category":"key_insight","title":"Insight","description":"x","start_index":0,"end_index":0,"importance":0.8}]'
        )
        gen = await client.post(
            f"/api/v1/clips/generate/{session_id}",
            headers=headers,
        )
    clip_id = gen.json()[0]["id"]
    resp = await client.post(
        "/api/v1/clip-collections",
        json={"title": "My Collection", "description": "Test", "clip_ids": [clip_id]},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "My Collection"
    assert clip_id in resp.json()["clip_ids"]


@pytest.mark.asyncio
async def test_list_clip_collections(client, db):
    """List clip collections."""
    session_id, headers = await _setup_org_job_session_messages(client, db)
    await client.post(
        "/api/v1/clip-collections",
        json={"title": "Col1", "clip_ids": []},
        headers=headers,
    )
    resp = await client.get("/api/v1/clip-collections", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
async def test_get_clip_collection(client, db):
    """Get collection with clips."""
    session_id, headers = await _setup_org_job_session_messages(client, db)
    with patch("interviewbot.services.clip_engine.AIEngine") as mock_engine:
        mock_engine.return_value.chat = AsyncMock(
            return_value='[{"category":"best_answer","title":"In collection","description":"x","start_index":0,"end_index":0,"importance":0.9}]'
        )
        gen = await client.post(
            f"/api/v1/clips/generate/{session_id}",
            headers=headers,
        )
    clip_id = gen.json()[0]["id"]
    create_resp = await client.post(
        "/api/v1/clip-collections",
        json={"title": "With clips", "clip_ids": [clip_id]},
        headers=headers,
    )
    coll_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/clip-collections/{coll_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "With clips"
    assert len(resp.json()["clips"]) == 1


@pytest.mark.asyncio
async def test_share_clip_collection(client, db):
    """Share clip collection generates public link."""
    session_id, headers = await _setup_org_job_session_messages(client, db)
    create_resp = await client.post(
        "/api/v1/clip-collections",
        json={"title": "Shareable", "clip_ids": []},
        headers=headers,
    )
    coll_id = create_resp.json()["id"]
    resp = await client.post(
        f"/api/v1/clip-collections/{coll_id}/share?hours=48",
        headers=headers,
    )
    assert resp.status_code == 200
    assert "share_url" in resp.json()
    assert "/clip-collections/" in resp.json()["share_url"]


@pytest.mark.asyncio
async def test_get_public_clip_collection(client, db):
    """Public clip collection endpoint returns data without auth."""
    session_id, headers = await _setup_org_job_session_messages(client, db)
    create_resp = await client.post(
        "/api/v1/clip-collections",
        json={"title": "Public collection", "clip_ids": []},
        headers=headers,
    )
    coll_id = create_resp.json()["id"]
    share_resp = await client.post(
        f"/api/v1/clip-collections/{coll_id}/share",
        headers=headers,
    )
    token = share_resp.json()["share_token"]
    resp = await client.get(f"/api/v1/clip-collections/public/{token}")
    assert resp.status_code == 200
    assert resp.json()["title"] == "Public collection"
