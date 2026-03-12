"""Proctoring and behavior analytics endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import BehaviorEventCreate, BehaviorSummary, IntegrityAssessment
from interviewbot.models.tables import BehaviorEvent, InterviewSession
from interviewbot.services.audio_analysis import analyze_response_timing
from interviewbot.services.behavior_analytics import (
    get_behavior_summary,
    get_composite_integrity,
    record_batch_events,
    record_behavior_event,
)
from interviewbot.routers.auth import limiter

logger = structlog.get_logger()
router = APIRouter(prefix="/proctoring", tags=["proctoring"])


@router.post("/events/{session_token}")
@limiter.limit("60/minute")
async def submit_behavior_event(
    request: Request,
    session_token: str,
    event: BehaviorEventCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public endpoint: candidate submits behavior events during interview."""
    session = await _get_session_by_token(db, session_token)
    await record_behavior_event(db, session.id, event)
    return {"status": "recorded"}


@router.post("/voice-timing/{session_token}")
@limiter.limit("60/minute")
async def submit_voice_timing(
    request: Request,
    session_token: str,
    timings: list[float] = Body(..., description="List of response latency values in ms"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public endpoint: record voice response timing data for anti-cheat analysis."""
    session = await _get_session_by_token(db, session_token)
    event = BehaviorEventCreate(
        event_type="voice_timing",
        data={"latencies_ms": timings},
    )
    await record_behavior_event(db, session.id, event)
    return {"status": "recorded", "count": len(timings)}


@router.post("/events/{session_token}/batch")
@limiter.limit("60/minute")
async def submit_behavior_events_batch(
    request: Request,
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

    # Check for voice timing data
    result = await db.execute(
        select(BehaviorEvent).where(
            BehaviorEvent.session_id == session_id,
            BehaviorEvent.event_type == "voice_timing",
        )
    )
    voice_events = result.scalars().all()

    audio_analysis = None
    if voice_events:
        all_latencies = []
        for event in voice_events:
            latencies = (event.data or {}).get("latencies_ms", [])
            all_latencies.extend(latencies)
        if all_latencies:
            timing_result = analyze_response_timing(all_latencies)
            audio_analysis = {
                "audio_flags": timing_result.audio_flags,
                "speech_consistency_score": timing_result.speech_consistency_score,
            }

    return await get_composite_integrity(db, session_id, audio_analysis)


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
