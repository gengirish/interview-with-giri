"""Coach — AI-powered interview coaching reports for practice sessions."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.dependencies import get_db
from interviewbot.models.tables import InterviewSession
from interviewbot.services.coaching_engine import generate_coaching_report

logger = structlog.get_logger()
router = APIRouter(prefix="/coach", tags=["Coach"])


@router.post("/analyze/{token}")
async def analyze_practice_session(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Generate a coaching report for a completed practice session."""
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.token == token)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status != "completed":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Interview must be completed before coaching analysis",
        )
    if not session.is_practice:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Coaching reports are only available for practice sessions",
        )

    report = await generate_coaching_report(str(session.id), db)
    if not report:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Failed to generate coaching report",
        )

    return report
