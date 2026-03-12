"""Proctoring and behavior analytics endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import BehaviorEventCreate, BehaviorSummary, IntegrityAssessment
from interviewbot.models.tables import InterviewSession
from interviewbot.services.behavior_analytics import (
    get_behavior_summary,
    get_integrity_assessment,
    record_batch_events,
    record_behavior_event,
)

logger = structlog.get_logger()
router = APIRouter(prefix="/proctoring", tags=["proctoring"])


@router.post("/events/{session_token}")
async def submit_behavior_event(
    session_token: str,
    event: BehaviorEventCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public endpoint: candidate submits behavior events during interview."""
    session = await _get_session_by_token(db, session_token)
    await record_behavior_event(db, session.id, event)
    return {"status": "recorded"}


@router.post("/events/{session_token}/batch")
async def submit_behavior_events_batch(
    session_token: str,
    events: list[BehaviorEventCreate],
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public endpoint: candidate submits a batch of behavior events."""
    session = await _get_session_by_token(db, session_token)
    count = await record_batch_events(db, session.id, events)
    return {"status": "recorded", "count": count}


@router.get("/summary/{session_id}", response_model=BehaviorSummary)
async def get_session_behavior_summary(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    org_id: uuid.UUID = Depends(get_org_id),
) -> BehaviorSummary:
    """Authenticated: get behavior summary for an interview session."""
    await _verify_session_org(db, session_id, org_id)
    return await get_behavior_summary(db, session_id)


@router.get("/integrity/{session_id}", response_model=IntegrityAssessment)
async def get_session_integrity(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    org_id: uuid.UUID = Depends(get_org_id),
) -> IntegrityAssessment:
    """Authenticated: get integrity assessment for an interview session."""
    await _verify_session_org(db, session_id, org_id)
    return await get_integrity_assessment(db, session_id)


async def _get_session_by_token(db: AsyncSession, token: str) -> InterviewSession:
    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
    if session.status not in ("pending", "in_progress"):
        raise HTTPException(status_code=400, detail="Interview is no longer active")
    return session


async def _verify_session_org(db: AsyncSession, session_id: uuid.UUID, org_id: uuid.UUID) -> None:
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Interview session not found")
