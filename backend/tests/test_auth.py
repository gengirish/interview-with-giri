"""E2E tests for authentication flows."""
import pytest

from tests.conftest import SIGNUP_PAYLOAD


@pytest.mark.asyncio
async def test_signup_creates_account_and_returns_token(client):
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["role"] == "admin"
    assert data["expires_in"] > 0
    assert data["org_id"]


@pytest.mark.asyncio
async def test_signup_duplicate_email_returns_409(client):
    await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_signup_missing_fields_returns_422(client):
    resp = await client.post("/api/v1/auth/signup", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_signup_short_password_returns_422(client):
    payload = {**SIGNUP_PAYLOAD, "password": "short"}
    resp = await client.post("/api/v1/auth/signup", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_signup_invalid_email_returns_422(client):
    payload = {**SIGNUP_PAYLOAD, "email": "not-an-email"}
    resp = await client.post("/api/v1/auth/signup", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_with_valid_credentials(client):
    await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": SIGNUP_PAYLOAD["email"], "password": SIGNUP_PAYLOAD["password"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(client):
    await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": SIGNUP_PAYLOAD["email"], "password": "wrongpassword"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user_returns_401(client):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@nowhere.com", "password": "password123"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_missing_fields_returns_422(client):
    resp = await client.post("/api/v1/auth/login", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_signup_token_works_for_authenticated_endpoints(client):
    signup_resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    token = signup_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get("/api/v1/job-postings", headers=headers)
    assert resp.status_code == 200
