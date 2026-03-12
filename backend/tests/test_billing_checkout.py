"""E2E tests for billing endpoints."""

import pytest


@pytest.mark.asyncio
async def test_billing_plans_is_public(client):
    """Billing plans endpoint should be accessible without auth."""
    response = await client.get("/api/v1/billing/plans")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    for plan in data:
        assert "id" in plan
        assert "name" in plan
        assert "price_monthly" in plan
        assert "interviews_limit" in plan


@pytest.mark.asyncio
async def test_checkout_requires_auth(client):
    """Checkout should require authentication."""
    response = await client.post(
        "/api/v1/billing/checkout",
        json={
            "plan_id": "professional",
            "success_url": "http://localhost:3000/success",
            "cancel_url": "http://localhost:3000/cancel",
        },
    )
    assert response.status_code == 401
