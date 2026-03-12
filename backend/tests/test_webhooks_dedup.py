"""E2E tests for webhook config deduplication."""

import pytest

from tests.conftest import SIGNUP_PAYLOAD


@pytest.mark.asyncio
async def test_webhook_config_dedup(client):
    """Adding the same webhook URL twice should not create duplicates."""
    signup_resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    headers = {"Authorization": f"Bearer {signup_resp.json()['access_token']}"}

    webhook_payload = {
        "url": "https://example.com/webhook",
        "events": ["interview.completed", "interview.scored"],
        "secret": "test-secret",
    }

    await client.post("/api/v1/webhooks/config", json=webhook_payload, headers=headers)
    await client.post("/api/v1/webhooks/config", json=webhook_payload, headers=headers)

    get_resp = await client.get("/api/v1/webhooks/config", headers=headers)
    assert get_resp.status_code == 200
    data = get_resp.json()
    webhooks = data.get("webhooks", [])
    urls = [wh.get("url") for wh in webhooks if wh.get("url")]
    assert urls.count("https://example.com/webhook") == 1
