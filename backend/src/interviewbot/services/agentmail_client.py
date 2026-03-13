"""AgentMail integration for AI-powered email delivery."""

from __future__ import annotations

import asyncio

import structlog

from interviewbot.config import get_settings

logger = structlog.get_logger()


def _get_client():  # type: ignore[no-untyped-def]
    """Return an AgentMail client or None when the API key is not configured."""
    settings = get_settings()
    if not settings.agentmail_api_key:
        return None
    from agentmail import AgentMail

    return AgentMail(api_key=settings.agentmail_api_key)


async def create_org_inbox(
    org_id: str,
    org_name: str,
) -> dict[str, str] | None:
    """Create (or retrieve via idempotent client_id) a dedicated inbox for an org."""
    client = _get_client()
    if client is None:
        return None
    try:
        settings = get_settings()
        inbox = await asyncio.to_thread(
            client.inboxes.create,
            username=f"interviews-{org_id[:8]}",
            domain=settings.agentmail_default_domain,
            display_name=f"{org_name} Interviews",
            client_id=f"org-{org_id}",
        )
        logger.info(
            "agentmail_inbox_created",
            org_id=org_id,
            inbox_id=inbox.inbox_id,
        )
        return {"inbox_id": inbox.inbox_id, "email": inbox.email}
    except Exception as exc:
        logger.error("agentmail_inbox_create_failed", org_id=org_id, error=str(exc))
        return None


async def send_email(
    inbox_id: str,
    to: str,
    subject: str,
    text: str,
    html: str | None = None,
) -> bool:
    """Send an email from an AgentMail inbox. Returns True on success."""
    client = _get_client()
    if client is None:
        return False
    try:
        kwargs: dict = {"to": to, "subject": subject, "text": text}
        if html:
            kwargs["html"] = html
        await asyncio.to_thread(
            client.inboxes.messages.send,
            inbox_id,
            **kwargs,
        )
        logger.info("agentmail_sent", to=to, subject=subject)
        return True
    except Exception as exc:
        logger.error("agentmail_send_failed", to=to, error=str(exc))
        return False


async def list_inbox_messages(inbox_id: str, limit: int = 20) -> list[dict]:
    """Retrieve recent messages from an AgentMail inbox."""
    client = _get_client()
    if client is None:
        return []
    try:
        result = await asyncio.to_thread(
            client.inboxes.messages.list,
            inbox_id,
            limit=limit,
        )
        return [
            {
                "from": getattr(msg, "from_", None),
                "subject": msg.subject,
                "text": getattr(msg, "extracted_text", None) or msg.text,
                "received_at": getattr(msg, "created_at", None),
            }
            for msg in result.messages
        ]
    except Exception as exc:
        logger.error("agentmail_list_failed", inbox_id=inbox_id, error=str(exc))
        return []
