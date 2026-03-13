"""Tests for white-label branding."""

import pytest

from tests.conftest import SIGNUP_PAYLOAD


async def _auth_headers(client):
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _setup_org_with_viewer(client):
    """Create org with admin and viewer. Returns (admin_headers, viewer_headers)."""
    signup = {
        **SIGNUP_PAYLOAD,
        "email": "branding-admin@testcorp.com",
    }
    resp = await client.post("/api/v1/auth/signup", json=signup)
    admin_h = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    invite = await client.post(
        "/api/v1/users",
        json={
            "email": "branding-viewer@testcorp.com",
            "full_name": "Viewer",
            "role": "viewer",
            "password": "password123",
        },
        headers=admin_h,
    )
    assert invite.status_code == 201
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "branding-viewer@testcorp.com", "password": "password123"},
    )
    viewer_h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    return admin_h, viewer_h


@pytest.mark.asyncio
async def test_get_default_branding(client, admin_headers, db):
    """GET /organizations/branding returns defaults."""
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/organizations/branding", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "logo_url" in data
    assert "primary_color" in data
    assert "company_name" in data
    assert "tagline" in data
    assert data["primary_color"] == "#4F46E5"


@pytest.mark.asyncio
async def test_update_branding(client, admin_headers, db):
    """PUT /organizations/branding updates branding settings."""
    headers = await _auth_headers(client)
    payload = {
        "logo_url": "https://example.com/logo.png",
        "primary_color": "#FF5733",
        "company_name": "Acme Corp",
        "tagline": "We hire the best",
    }
    resp = await client.put("/api/v1/organizations/branding", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "updated"
    assert data["branding"]["company_name"] == "Acme Corp"
    assert data["branding"]["primary_color"] == "#FF5733"


@pytest.mark.asyncio
async def test_get_branding_after_update(client, admin_headers, db):
    """Branding persists after update."""
    headers = await _auth_headers(client)
    payload = {
        "logo_url": "https://example.com/logo2.png",
        "primary_color": "#00FF00",
        "company_name": "Updated Corp",
        "tagline": "New tagline",
    }
    await client.put("/api/v1/organizations/branding", json=payload, headers=headers)
    resp = await client.get("/api/v1/organizations/branding", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["company_name"] == "Updated Corp"
    assert data["primary_color"] == "#00FF00"
    assert data["logo_url"] == "https://example.com/logo2.png"


@pytest.mark.asyncio
async def test_update_branding_viewer_forbidden(client, viewer_headers, db):
    """Viewers cannot update branding."""
    _admin_h, viewer_h = await _setup_org_with_viewer(client)
    payload = {
        "logo_url": "",
        "primary_color": "#4F46E5",
        "company_name": "Test",
        "tagline": "",
    }
    resp = await client.put("/api/v1/organizations/branding", json=payload, headers=viewer_h)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_public_interview_includes_branding(client, db):
    """GET /interviews/public/{token} includes branding data."""
    from tests.conftest import JOB_PAYLOAD

    headers = await _auth_headers(client)
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]
    link_resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    token = link_resp.json()["token"]

    payload = {
        "logo_url": "https://brand.com/logo.png",
        "primary_color": "#123456",
        "company_name": "Brand Corp",
        "tagline": "Brand tagline",
    }
    await client.put("/api/v1/organizations/branding", json=payload, headers=headers)

    resp = await client.get(f"/api/v1/interviews/public/{token}")
    assert resp.status_code == 200
    data = resp.json()
    assert "branding" in data
    assert data["branding"]["company_name"] == "Brand Corp"
    assert data["branding"]["primary_color"] == "#123456"
    assert data["branding"]["logo_url"] == "https://brand.com/logo.png"
