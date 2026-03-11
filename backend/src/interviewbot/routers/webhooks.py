"""Outbound webhook system for notifying external systems about interview events."""

from uuid import UUID

import httpx
import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.tables import Organization

logger = structlog.get_logger()

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


class WebhookConfig(BaseModel):
    url: str = Field(..., min_length=10)
    events: list[str] = Field(default_factory=lambda: ["interview.completed", "interview.scored"])
    secret: str = Field("", description="HMAC secret for signature verification")


@router.get("/config")
async def get_webhook_config(
    user: dict = Depends(require_role("admin")),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    result = await db.execute(
        select(Organization).where(Organization.id == org_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        return {"webhooks": []}

    webhook_settings = (org.settings or {}).get("webhooks", [])
    return {"webhooks": webhook_settings}


@router.post("/config")
async def update_webhook_config(
    config: WebhookConfig,
    user: dict = Depends(require_role("admin")),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    result = await db.execute(
        select(Organization).where(Organization.id == org_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        return {"error": "Organization not found"}

    settings = org.settings or {}
    webhooks = settings.get("webhooks", [])
    webhooks.append(config.model_dump())
    settings["webhooks"] = webhooks
    org.settings = settings
    await db.commit()

    return {"status": "added", "webhooks": webhooks}


async def dispatch_webhook(org_id: str, event_type: str, payload: dict, db: AsyncSession) -> None:
    """Fire outbound webhooks for an organization."""
    result = await db.execute(
        select(Organization).where(Organization.id == org_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        return

    webhooks = (org.settings or {}).get("webhooks", [])

    for wh in webhooks:
        events = wh.get("events", [])
        if event_type not in events and "*" not in events:
            continue

        url = wh.get("url", "")
        if not url:
            continue

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    url,
                    json={
                        "event": event_type,
                        "data": payload,
                    },
                    headers={"Content-Type": "application/json"},
                )
            logger.info("webhook_dispatched", url=url, event=event_type)
        except Exception as e:
            logger.warning("webhook_failed", url=url, event=event_type, error=str(e))
