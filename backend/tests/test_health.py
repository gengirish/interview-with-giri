import pytest


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
