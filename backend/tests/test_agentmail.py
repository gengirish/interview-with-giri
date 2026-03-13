"""Tests for AgentMail integration - client, notifications fallback, and API."""

from __future__ import annotations

from unittest.mock import MagicMock, patch
import uuid

from httpx import AsyncClient
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.models.tables import Organization

DEMO_ORG_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"


async def _seed_org(db: AsyncSession, inbox_id: str | None = None) -> Organization:
    org = Organization(
        id=uuid.UUID(DEMO_ORG_ID),
        name="Test Corp",
        agentmail_inbox_id=inbox_id,
        agentmail_email="interviews@agentmail.to" if inbox_id else None,
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


# ---------------------------------------------------------------------------
# agentmail_client unit tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_email_returns_false_when_no_api_key():
    with patch(
        "interviewbot.services.agentmail_client.get_settings",
        return_value=MagicMock(agentmail_api_key=""),
    ):
        from interviewbot.services.agentmail_client import send_email

        result = await send_email("inbox_1", "a@b.com", "Hi", "Body")
        assert result is False


@pytest.mark.asyncio
async def test_send_email_success():
    mock_client = MagicMock()
    with (
        patch(
            "interviewbot.services.agentmail_client.get_settings",
            return_value=MagicMock(agentmail_api_key="am_test"),
        ),
        patch(
            "interviewbot.services.agentmail_client.AgentMail",
            return_value=mock_client,
        ),
    ):
        from interviewbot.services.agentmail_client import send_email

        result = await send_email("inbox_1", "a@b.com", "Sub", "Text", "<p>HTML</p>")
        assert result is True


@pytest.mark.asyncio
async def test_create_org_inbox_success():
    mock_inbox = MagicMock(inbox_id="inbox_xyz", email="test@agentmail.to")
    mock_client = MagicMock()
    mock_client.inboxes.create.return_value = mock_inbox
    with (
        patch(
            "interviewbot.services.agentmail_client.get_settings",
            return_value=MagicMock(
                agentmail_api_key="am_test",
                agentmail_default_domain="agentmail.to",
            ),
        ),
        patch(
            "interviewbot.services.agentmail_client.AgentMail",
            return_value=mock_client,
        ),
    ):
        from interviewbot.services.agentmail_client import create_org_inbox

        result = await create_org_inbox("org-123", "Acme")
        assert result is not None
        assert result["inbox_id"] == "inbox_xyz"
        assert result["email"] == "test@agentmail.to"


@pytest.mark.asyncio
async def test_create_org_inbox_returns_none_without_key():
    with patch(
        "interviewbot.services.agentmail_client.get_settings",
        return_value=MagicMock(agentmail_api_key=""),
    ):
        from interviewbot.services.agentmail_client import create_org_inbox

        result = await create_org_inbox("org-123", "Acme")
        assert result is None


# ---------------------------------------------------------------------------
# notifications fallback tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_notifications_uses_agentmail_when_configured():
    """_send_email should prefer AgentMail when api key and inbox_id are present."""
    with (
        patch(
            "interviewbot.services.notifications.get_settings",
            return_value=MagicMock(
                agentmail_api_key="am_test",
                smtp_host="",
            ),
        ),
        patch(
            "interviewbot.services.agentmail_client.send_email",
        ) as mock_client_send,
    ):
        mock_client_send.return_value = True
        from interviewbot.services.notifications import _send_email

        result = await _send_email("a@b.com", "Sub", "<p>Hi</p>", org_inbox_id="inbox_1")
        assert result is True


@pytest.mark.asyncio
async def test_notifications_falls_back_to_smtp_when_no_inbox_id():
    """When org_inbox_id is None, AgentMail is skipped."""
    with patch(
        "interviewbot.services.notifications.get_settings",
        return_value=MagicMock(
            agentmail_api_key="am_test",
            smtp_host="",
        ),
    ):
        from interviewbot.services.notifications import _send_email

        result = await _send_email("a@b.com", "Sub", "<p>Hi</p>")
        assert result is False


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_email_status_no_inbox(
    client: AsyncClient,
    admin_headers: dict[str, str],
    db: AsyncSession,
):
    await _seed_org(db)
    resp = await client.get(
        "/api/v1/organizations/email/status",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is False
    assert data["inbox_id"] is None


@pytest.mark.asyncio
async def test_email_status_with_inbox(
    client: AsyncClient,
    admin_headers: dict[str, str],
    db: AsyncSession,
):
    await _seed_org(db, inbox_id="inbox_abc")
    resp = await client.get(
        "/api/v1/organizations/email/status",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["inbox_id"] == "inbox_abc"


@pytest.mark.asyncio
async def test_email_setup_creates_inbox(
    client: AsyncClient,
    admin_headers: dict[str, str],
    db: AsyncSession,
):
    await _seed_org(db)
    with patch(
        "interviewbot.routers.organizations.create_org_inbox",
        return_value={"inbox_id": "inbox_new", "email": "new@agentmail.to"},
    ):
        resp = await client.post(
            "/api/v1/organizations/email/setup",
            headers=admin_headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["inbox_id"] == "inbox_new"
    assert data["email"] == "new@agentmail.to"
    assert data["already_configured"] is False


@pytest.mark.asyncio
async def test_email_setup_idempotent(
    client: AsyncClient,
    admin_headers: dict[str, str],
    db: AsyncSession,
):
    await _seed_org(db, inbox_id="inbox_existing")
    resp = await client.post(
        "/api/v1/organizations/email/setup",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["already_configured"] is True
    assert data["inbox_id"] == "inbox_existing"


@pytest.mark.asyncio
async def test_email_setup_viewer_forbidden(
    client: AsyncClient,
    viewer_headers: dict[str, str],
    db: AsyncSession,
):
    await _seed_org(db)
    resp = await client.post(
        "/api/v1/organizations/email/setup",
        headers=viewer_headers,
    )
    assert resp.status_code == 403
