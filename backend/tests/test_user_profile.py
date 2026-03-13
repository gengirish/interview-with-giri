"""Tests for user profile endpoint GET /api/v1/users/me."""

import pytest

from tests.conftest import SIGNUP_PAYLOAD


@pytest.mark.asyncio
async def test_get_current_user_profile(client):
    """GET /api/v1/users/me with valid auth returns 200 with user data (email, role)."""
    signup_resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    assert signup_resp.status_code == 201
    token = signup_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == SIGNUP_PAYLOAD["email"]
    assert data["role"] == "admin"
    assert "id" in data
    assert "full_name" in data
    assert "is_active" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_profile_requires_auth(client):
    """GET /api/v1/users/me without auth returns 401 or 403."""
    resp = await client.get("/api/v1/users/me")
    assert resp.status_code in (401, 403)
