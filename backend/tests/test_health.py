"""E2E tests for health check endpoints."""

import pytest

pytestmark = pytest.mark.smoke


@pytest.mark.asyncio
async def test_health_endpoint(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "interviewbot-api"


@pytest.mark.asyncio
async def test_health_returns_correct_content_type(client):
    response = await client.get("/api/v1/health")
    assert "application/json" in response.headers["content-type"]


@pytest.mark.asyncio
async def test_db_health_endpoint(client):
    response = await client.get("/api/v1/health/db")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"


@pytest.mark.asyncio
@pytest.mark.smoke
async def test_health_redis_returns_healthy_or_unhealthy(client):
    """Health redis endpoint should return 200 or 503 depending on Redis availability."""
    response = await client.get("/api/v1/health/redis")
    assert response.status_code in (200, 503)
    data = response.json()
    assert "status" in data
    assert "redis" in data
    if response.status_code == 200:
        assert data["status"] == "healthy"
        assert data["redis"] == "connected"
    else:
        assert data["status"] == "unhealthy"
        assert data["redis"] == "disconnected"


@pytest.mark.asyncio
async def test_health_redis_is_public(client):
    """Health redis endpoint should not require authentication."""
    response = await client.get("/api/v1/health/redis")
    assert response.status_code != 401
