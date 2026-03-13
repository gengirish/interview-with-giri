"""Tests for practice mode endpoints."""

import pytest
from sqlalchemy import select

from interviewbot.models.tables import InterviewSession


@pytest.mark.asyncio
async def test_get_practice_templates(client):
    """Practice templates endpoint returns builtin templates (no auth)."""
    resp = await client.get("/api/v1/practice/templates")
    assert resp.status_code == 200
    templates = resp.json()
    assert len(templates) >= 6
    names = [t["name"] for t in templates]
    assert "Software Engineer" in names


@pytest.mark.asyncio
async def test_start_practice_session(client):
    """Start practice creates session with is_practice=True."""
    resp = await client.post(
        "/api/v1/practice/start",
        json={
            "template_id": "builtin-swe",
            "candidate_name": "Test User",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "interview_url" in data
    assert data["role_type"] == "technical"


@pytest.mark.asyncio
async def test_practice_session_is_marked_as_practice(client, db):
    """Verify the created session has is_practice=True."""
    resp = await client.post(
        "/api/v1/practice/start",
        json={
            "template_id": "builtin-fe",
            "candidate_name": "Practice User",
        },
    )
    assert resp.status_code == 200
    token = resp.json()["token"]

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one()
    assert session.is_practice is True


@pytest.mark.asyncio
async def test_practice_no_auth_required(client):
    """Practice endpoints work without authentication."""
    resp = await client.get("/api/v1/practice/templates")
    assert resp.status_code == 200

    resp = await client.post(
        "/api/v1/practice/start",
        json={"template_id": "builtin-swe"},
    )
    assert resp.status_code == 200
