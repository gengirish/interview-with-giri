from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_current_user, get_db, get_org_id, require_role
from interviewbot.models.tables import Organization
from interviewbot.services.agentmail_client import create_org_inbox

router = APIRouter(prefix="/organizations", tags=["Organization"])


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
