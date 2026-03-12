"""E2E tests for ATS integration endpoints (Phase 3A).

Tests cover:
- ATS config CRUD (save, list, delete)
- RBAC: admin and hiring_manager can access; viewer cannot
- ATS push endpoint with mocked external API
- Validation of platform names
"""
import pytest
from unittest.mock import AsyncMock, patch

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD

pytestmark = pytest.mark.smoke

GREENHOUSE_CONFIG = {
    "platform": "greenhouse",
    "api_key": "gh_test_key_12345",
    "enabled": True,
}

LEVER_CONFIG = {
    "platform": "lever",
    "api_key": "lever_test_key_12345",
    "enabled": True,
}


async def _setup_org(client):
    """Create org and return admin headers."""
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _setup_org_with_roles(client):
    """Create org with admin and hiring_manager."""
    signup = {**SIGNUP_PAYLOAD, "email": "ats-admin@testcorp.com"}
    resp = await client.post("/api/v1/auth/signup", json=signup)
    admin_token = resp.json()["access_token"]
    admin_h = {"Authorization": f"Bearer {admin_token}"}

    hm_invite = {
        "email": "ats-hm@testcorp.com",
        "full_name": "HM User",
        "role": "hiring_manager",
        "password": "password123",
    }
    await client.post("/api/v1/users", json=hm_invite, headers=admin_h)
    hm_login = await client.post(
        "/api/v1/auth/login",
        json={"email": hm_invite["email"], "password": hm_invite["password"]},
    )
    hm_h = {"Authorization": f"Bearer {hm_login.json()['access_token']}"}

    viewer_invite = {
        "email": "ats-viewer@testcorp.com",
        "full_name": "Viewer User",
        "role": "viewer",
        "password": "password123",
    }
    await client.post("/api/v1/users", json=viewer_invite, headers=admin_h)
    viewer_login = await client.post(
        "/api/v1/auth/login",
        json={"email": viewer_invite["email"], "password": viewer_invite["password"]},
    )
    viewer_h = {"Authorization": f"Bearer {viewer_login.json()['access_token']}"}

    return admin_h, hm_h, viewer_h


# ────────────────────────────────────────
#  ATS Config CRUD
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_save_ats_config(client):
    headers = await _setup_org(client)
    resp = await client.post("/api/v1/ats/config", json=GREENHOUSE_CONFIG, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "saved"
    assert resp.json()["platform"] == "greenhouse"


@pytest.mark.asyncio
async def test_list_ats_configs_empty(client):
    headers = await _setup_org(client)
    resp = await client.get("/api/v1/ats/config", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_ats_configs_after_save(client):
    headers = await _setup_org(client)
    await client.post("/api/v1/ats/config", json=GREENHOUSE_CONFIG, headers=headers)
    await client.post("/api/v1/ats/config", json=LEVER_CONFIG, headers=headers)

    resp = await client.get("/api/v1/ats/config", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    platforms = {c["platform"] for c in data}
    assert platforms == {"greenhouse", "lever"}


@pytest.mark.asyncio
async def test_ats_config_does_not_expose_api_key(client):
    headers = await _setup_org(client)
    await client.post("/api/v1/ats/config", json=GREENHOUSE_CONFIG, headers=headers)

    resp = await client.get("/api/v1/ats/config", headers=headers)
    for config in resp.json():
        assert "api_key" not in config


@pytest.mark.asyncio
async def test_save_ats_config_upserts(client):
    headers = await _setup_org(client)
    await client.post("/api/v1/ats/config", json=GREENHOUSE_CONFIG, headers=headers)

    updated = {**GREENHOUSE_CONFIG, "api_key": "new_key_67890"}
    await client.post("/api/v1/ats/config", json=updated, headers=headers)

    resp = await client.get("/api/v1/ats/config", headers=headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["platform"] == "greenhouse"


@pytest.mark.asyncio
async def test_delete_ats_config(client):
    headers = await _setup_org(client)
    await client.post("/api/v1/ats/config", json=GREENHOUSE_CONFIG, headers=headers)

    resp = await client.delete("/api/v1/ats/config/greenhouse", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"

    configs = await client.get("/api/v1/ats/config", headers=headers)
    assert configs.json() == []


@pytest.mark.asyncio
async def test_delete_nonexistent_config_is_idempotent(client):
    headers = await _setup_org(client)
    resp = await client.delete("/api/v1/ats/config/greenhouse", headers=headers)
    assert resp.status_code == 200


# ────────────────────────────────────────
#  Validation
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_save_invalid_platform_returns_422(client):
    headers = await _setup_org(client)
    invalid = {"platform": "invalid_ats", "api_key": "key123"}
    resp = await client.post("/api/v1/ats/config", json=invalid, headers=headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_save_empty_api_key_returns_422(client):
    headers = await _setup_org(client)
    invalid = {"platform": "greenhouse", "api_key": ""}
    resp = await client.post("/api/v1/ats/config", json=invalid, headers=headers)
    assert resp.status_code == 422


# ────────────────────────────────────────
#  RBAC
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_viewer_cannot_access_ats_config(client):
    _, _, viewer_h = await _setup_org_with_roles(client)
    resp = await client.get("/api/v1/ats/config", headers=viewer_h)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_save_ats_config(client):
    _, _, viewer_h = await _setup_org_with_roles(client)
    resp = await client.post("/api/v1/ats/config", json=GREENHOUSE_CONFIG, headers=viewer_h)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_delete_ats_config(client):
    _, _, viewer_h = await _setup_org_with_roles(client)
    resp = await client.delete("/api/v1/ats/config/greenhouse", headers=viewer_h)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_hiring_manager_can_manage_ats_config(client):
    _, hm_h, _ = await _setup_org_with_roles(client)
    resp = await client.post("/api/v1/ats/config", json=GREENHOUSE_CONFIG, headers=hm_h)
    assert resp.status_code == 200

    list_resp = await client.get("/api/v1/ats/config", headers=hm_h)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1


@pytest.mark.asyncio
async def test_ats_config_requires_auth(client):
    resp = await client.get("/api/v1/ats/config")
    assert resp.status_code in (401, 403)


# ────────────────────────────────────────
#  ATS Push (mocked external API)
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_push_without_config_returns_400(client):
    headers = await _setup_org(client)
    fake_session_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.post(
        "/api/v1/ats/push",
        json={"platform": "greenhouse", "session_id": fake_session_id},
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_push_invalid_platform_returns_422(client):
    headers = await _setup_org(client)
    resp = await client.post(
        "/api/v1/ats/push",
        json={"platform": "invalid", "session_id": "00000000-0000-0000-0000-000000000000"},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_viewer_cannot_push_to_ats(client):
    _, _, viewer_h = await _setup_org_with_roles(client)
    resp = await client.post(
        "/api/v1/ats/push",
        json={"platform": "greenhouse", "session_id": "00000000-0000-0000-0000-000000000000"},
        headers=viewer_h,
    )
    assert resp.status_code == 403
