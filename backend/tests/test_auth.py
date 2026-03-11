import pytest


@pytest.mark.asyncio
async def test_login_missing_fields(client):
    response = await client.post("/api/v1/auth/login", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_invalid_email_format(client):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "not-an-email", "password": "password123"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_signup_missing_fields(client):
    response = await client.post("/api/v1/auth/signup", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_signup_short_password(client):
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": "Test Corp",
            "full_name": "John Doe",
            "email": "john@test.com",
            "password": "short",
        },
    )
    assert response.status_code == 422
