from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_current_user, get_db, get_org_id, require_role
from interviewbot.models.tables import Organization
from interviewbot.services.agentmail_client import create_org_inbox

router = APIRouter(prefix="/organizations", tags=["Organization"])


class BrandingSettings(BaseModel):
    logo_url: str = ""
    primary_color: str = "#4F46E5"
    company_name: str = ""
    tagline: str = ""


@router.get("/branding")
async def get_branding(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Get the organization's branding settings."""
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")

    settings = org.settings or {}
    branding = settings.get("branding", {})
    return {
        "logo_url": branding.get("logo_url", ""),
        "primary_color": branding.get("primary_color", "#4F46E5"),
        "company_name": branding.get("company_name", org.name),
        "tagline": branding.get("tagline", ""),
    }


@router.put("/branding")
async def update_branding(
    branding: BrandingSettings,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Update the organization's branding settings."""
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")

    current_settings = dict(org.settings or {})
    current_settings["branding"] = branding.model_dump()
    org.settings = current_settings
    await db.commit()

    return {"status": "updated", "branding": branding.model_dump()}


@router.post("/email/setup")
async def setup_org_email(
    user: dict = Depends(require_role("admin")),  # type: ignore[assignment]
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):  # type: ignore[no-untyped-def]
    """Create an AgentMail inbox for the organisation (idempotent)."""
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")

    if org.agentmail_inbox_id:
        return {
            "inbox_id": org.agentmail_inbox_id,
            "email": org.agentmail_email,
            "already_configured": True,
        }

    inbox = await create_org_inbox(str(org_id), org.name)
    if not inbox:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Failed to create email inbox — check AGENTMAIL_API_KEY",
        )

    org.agentmail_inbox_id = inbox["inbox_id"]
    org.agentmail_email = inbox["email"]
    await db.commit()

    return {
        "inbox_id": inbox["inbox_id"],
        "email": inbox["email"],
        "already_configured": False,
    }


@router.get("/email/status")
async def get_email_status(
    user: dict = Depends(get_current_user),  # type: ignore[assignment]
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):  # type: ignore[no-untyped-def]
    """Return the current email-inbox configuration for the org."""
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")

    return {
        "configured": bool(org.agentmail_inbox_id),
        "inbox_id": org.agentmail_inbox_id,
        "email": org.agentmail_email,
    }
