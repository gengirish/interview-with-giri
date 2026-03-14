"""Accessibility API for interview accommodations."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import (
    AccessibilityConfig,
    AccessibilityOrgSettings,
)
from interviewbot.models.tables import InterviewSession, Organization
from interviewbot.services.accessibility_service import get_css_overrides

router = APIRouter(prefix="/accessibility", tags=["Accessibility"])


def _default_config() -> dict:
    return AccessibilityConfig().model_dump()


@router.get("/config/{token}")
async def get_accessibility_config(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get accessibility config for a session by token (public)."""
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.token == token)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    config = session.accessibility_config
    return config if config else _default_config()


@router.put("/config/{token}")
async def update_accessibility_config(
    token: str,
    body: AccessibilityConfig,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Candidate sets their accessibility preferences (public)."""
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.token == token)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    session.accessibility_config = body.model_dump()
    await db.commit()
    return body.model_dump()


@router.get("/org-settings")
async def get_accessibility_org_settings(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    """Get org accessibility defaults (JWT required)."""
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    settings = org.settings or {}
    acc = settings.get("accessibility", {})
    return AccessibilityOrgSettings(**acc).model_dump() if acc else AccessibilityOrgSettings().model_dump()


@router.put("/org-settings")
async def update_accessibility_org_settings(
    body: AccessibilityOrgSettings,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    """Update org accessibility settings (admin only)."""
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    current_settings = dict(org.settings or {})
    current_settings["accessibility"] = body.model_dump()
    org.settings = current_settings
    await db.commit()
    return body.model_dump()


@router.get("/css-overrides/{token}")
async def get_accessibility_css_overrides(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Get CSS overrides for a session (public)."""
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.token == token)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    config = session.accessibility_config
    return get_css_overrides(config)
