"""Candidate feedback - NPS and satisfaction ratings after interview completion."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.tables import CandidateFeedback, InterviewSession

router = APIRouter(prefix="/interviews", tags=["Feedback"])


class FeedbackSubmitRequest(BaseModel):
    overall_rating: int = Field(..., ge=1, le=5)
    fairness_rating: int | None = Field(None, ge=1, le=5)
    clarity_rating: int | None = Field(None, ge=1, le=5)
    relevance_rating: int | None = Field(None, ge=1, le=5)
    comment: str | None = Field(None, max_length=2000)


@router.post("/public/{token}/feedback")
async def submit_feedback(
    token: str,
    body: FeedbackSubmitRequest,
    db: AsyncSession = Depends(get_db),
):
    """Submit candidate feedback after completing an interview. No auth required."""
    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")

    if session.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Feedback can only be submitted for completed interviews",
        )

    existing = await db.execute(
        select(CandidateFeedback).where(CandidateFeedback.session_id == session.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Feedback already submitted for this interview",
        )

    feedback = CandidateFeedback(
        session_id=session.id,
        overall_rating=body.overall_rating,
        fairness_rating=body.fairness_rating,
        clarity_rating=body.clarity_rating,
        relevance_rating=body.relevance_rating,
        comment=body.comment,
    )
    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)

    return {"id": str(feedback.id), "message": "Thank you!"}
