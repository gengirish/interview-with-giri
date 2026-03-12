"""Tests for outbound webhook dispatch."""

from unittest.mock import AsyncMock, patch

import pytest

from interviewbot.models.tables import Organization
from interviewbot.routers.webhooks import dispatch_webhook


@pytest.mark.asyncio
async def test_dispatch_webhook_no_webhooks_configured(db: object) -> None:
    org = Organization(name="No Webhooks Org", settings={})
    db.add(org)
    await db.commit()
    await db.refresh(org)

    with patch("interviewbot.routers.webhooks.httpx.AsyncClient") as mock_client_class:
        await dispatch_webhook(
            str(org.id),
            "interview.completed",
            {"session_id": "s1"},
            db,
        )
        mock_client_class.assert_not_called()


@pytest.mark.asyncio
async def test_dispatch_webhook_with_webhook_configured(db: object) -> None:
    org = Organization(
        name="Webhook Org",
        settings={
            "webhooks": [
                {
                    "url": "https://example.com/webhook",
                    "events": ["interview.completed"],
                    "secret": "mysecret",
                }
            ]
        },
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)

    post_mock = AsyncMock()
    mock_client = AsyncMock()
    mock_client.post = post_mock

    with patch("interviewbot.routers.webhooks.httpx.AsyncClient") as mock_client_class:
        mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

        await dispatch_webhook(
            str(org.id),
            "interview.completed",
            {"session_id": "s1", "candidate": "Alice"},
            db,
        )

        post_mock.assert_called_once()
        call_args = post_mock.call_args
        assert call_args[0][0] == "https://example.com/webhook"
        headers = call_args[1]["headers"]
        assert headers["Content-Type"] == "application/json"
        assert "X-Webhook-Signature" in headers
        content = call_args[1]["content"]
        assert '"event":"interview.completed"' in content
        assert '"session_id":"s1"' in content


@pytest.mark.asyncio
async def test_dispatch_webhook_url_unreachable(db: object) -> None:
    from httpx import ConnectError

    org = Organization(
        name="Unreachable Org",
        settings={
            "webhooks": [
                {
                    "url": "https://unreachable.example.com/wh",
                    "events": ["interview.completed"],
                    "secret": "",
                }
            ]
        },
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)

    post_mock = AsyncMock(side_effect=ConnectError("Connection refused"))
    mock_client = AsyncMock()
    mock_client.post = post_mock

    with patch("interviewbot.routers.webhooks.httpx.AsyncClient") as mock_client_class:
        mock_client_class.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_class.return_value.__aexit__ = AsyncMock(return_value=None)

        await dispatch_webhook(
            str(org.id),
            "interview.completed",
            {"session_id": "s1"},
            db,
        )
