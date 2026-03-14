"""Tests for walkthrough progress endpoints."""

import pytest

from tests.conftest import SIGNUP_PAYLOAD


@pytest.mark.asyncio
async def test_get_walkthrough_default(client):
    """GET /api/v1/users/me/walkthrough returns empty state for new user."""
    signup = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    resp = await client.get("/api/v1/users/me/walkthrough", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["completed"] == {}
    assert data["skipped"] == {}
    assert data["version"] == 1


@pytest.mark.asyncio
async def test_patch_walkthrough_merges(client):
    """PATCH /api/v1/users/me/walkthrough merges completed/skipped without overwriting."""
    signup = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    resp1 = await client.patch(
        "/api/v1/users/me/walkthrough",
        headers=headers,
        json={"completed": {"dashboard-overview": True}},
    )
    assert resp1.status_code == 200
    assert resp1.json()["completed"]["dashboard-overview"] is True

    resp2 = await client.patch(
        "/api/v1/users/me/walkthrough",
        headers=headers,
        json={"completed": {"jobs-page": True}, "skipped": {"analytics-page": True}},
    )
    assert resp2.status_code == 200
    data = resp2.json()
    assert data["completed"]["dashboard-overview"] is True
    assert data["completed"]["jobs-page"] is True
    assert data["skipped"]["analytics-page"] is True


@pytest.mark.asyncio
async def test_walkthrough_requires_auth(client):
    """GET /api/v1/users/me/walkthrough without auth returns 401 or 403."""
    resp = await client.get("/api/v1/users/me/walkthrough")
    assert resp.status_code in (401, 403)
