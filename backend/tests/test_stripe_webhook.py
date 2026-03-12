"""Tests for Stripe webhook handler."""

import json
from unittest.mock import patch

import pytest
from sqlalchemy import select

from interviewbot.models.tables import Subscription
from tests.conftest import SIGNUP_PAYLOAD


@pytest.mark.asyncio
async def test_stripe_webhook_missing_secret(client):
    with patch("interviewbot.routers.billing.get_settings") as mock_settings:
        mock_settings.return_value.stripe_webhook_secret = ""
        response = await client.post(
            "/api/v1/billing/webhook",
            content=b"{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 503


@pytest.mark.asyncio
async def test_stripe_webhook_invalid_signature(client):
    with patch("interviewbot.routers.billing.get_settings") as mock_settings:
        mock_settings.return_value.stripe_webhook_secret = "whsec_test"
        with patch("stripe.Webhook.construct_event") as mock_construct:
            mock_construct.side_effect = ValueError("Invalid signature")
            response = await client.post(
                "/api/v1/billing/webhook",
                content=b'{"type":"checkout.session.completed"}',
                headers={
                    "Content-Type": "application/json",
                    "stripe-signature": "invalid",
                },
            )
            assert response.status_code == 400


@pytest.mark.asyncio
async def test_stripe_webhook_checkout_completed(client, db):
    signup_resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    org_id = str(signup_resp.json()["org_id"])

    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "metadata": {"org_id": org_id, "plan_id": "professional"},
                "customer": "cus_test123",
                "subscription": "sub_test456",
            }
        },
    }

    with patch("interviewbot.routers.billing.get_settings") as mock_settings:
        mock_settings.return_value.stripe_webhook_secret = "whsec_test"
        with patch("stripe.Webhook.construct_event") as mock_construct:
            mock_construct.return_value = event
            response = await client.post(
                "/api/v1/billing/webhook",
                content=json.dumps(event).encode(),
                headers={
                    "Content-Type": "application/json",
                    "stripe-signature": "t=123,v1=abc",
                },
            )
            assert response.status_code == 200
            assert response.json() == {"received": True}

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == "sub_test456")
    )
    sub = result.scalar_one_or_none()
    assert sub is not None
    assert str(sub.org_id) == org_id
    assert sub.plan_tier == "professional"
    assert sub.interviews_limit == 200
    assert sub.status == "active"
