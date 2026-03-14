"""AI Interview Co-Pilot: real-time suggestions, competency coverage, legal checks."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.tables import (
    CopilotSession,
    InterviewMessage,
    InterviewSession,
    JobPosting,
)
from interviewbot.services.copilot_engine import (
    check_legal_risk,
    compute_coverage,
    generate_suggestions,
)

router = APIRouter(prefix="/copilot", tags=["Co-Pilot"])


@router.get("/history/list")
async def copilot_history(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
):
    """List copilot sessions for the current user."""
    user_id = UUID(str(user["sub"]))
    result = await db.execute(
        select(CopilotSession)
        .where(CopilotSession.user_id == user_id)
        .order_by(CopilotSession.started_at.desc())
    )
    return result.scalars().all()


@router.post("/start/{session_id}")
async def start_copilot(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager")),
    org_id: UUID = Depends(get_org_id),
):
    """Start or resume a copilot session for an interview."""
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview session not found")

    user_id = UUID(str(user["sub"]))
    result = await db.execute(
        select(CopilotSession).where(
            CopilotSession.interview_session_id == session_id,
            CopilotSession.user_id == user_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing and existing.status == "active":
        return existing

    copilot = CopilotSession(
        interview_session_id=session_id,
        user_id=user_id,
        status="active",
        config={},
    )
    db.add(copilot)
    await db.commit()
    await db.refresh(copilot)
    return copilot


async def _get_copilot_with_org_check(
    db: AsyncSession, copilot_id: UUID, org_id: UUID
) -> CopilotSession | None:
    result = await db.execute(select(CopilotSession).where(CopilotSession.id == copilot_id))
    copilot = result.scalar_one_or_none()
    if not copilot:
        return None
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == copilot.interview_session_id,
            InterviewSession.org_id == org_id,
        )
    )
    if not session_result.scalar_one_or_none():
        return None
    return copilot


@router.get("/{copilot_id}")
async def get_copilot(
    copilot_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    org_id: UUID = Depends(get_org_id),
):
    """Get a copilot session by ID."""
    copilot = await _get_copilot_with_org_check(db, copilot_id, org_id)
    if not copilot:
        raise HTTPException(status_code=404, detail="Copilot session not found")
    return copilot


@router.get("/{copilot_id}/coverage")
async def get_coverage(
    copilot_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    org_id: UUID = Depends(get_org_id),
):
    """Get competency coverage for the interview."""
    copilot = await _get_copilot_with_org_check(db, copilot_id, org_id)
    if not copilot:
        raise HTTPException(status_code=404, detail="Copilot session not found")

    msg_result = await db.execute(
        select(InterviewMessage)
        .where(InterviewMessage.session_id == copilot.interview_session_id)
        .order_by(InterviewMessage.created_at)
    )
    messages = [{"content": m.content, "role": m.role} for m in msg_result.scalars().all()]

    job_result = await db.execute(
        select(JobPosting).join(
            InterviewSession, InterviewSession.job_posting_id == JobPosting.id
        ).where(InterviewSession.id == copilot.interview_session_id)
    )
    job = job_result.scalar_one_or_none()
    skills = list(job.required_skills) if job and job.required_skills else []

    coverage = compute_coverage(skills, messages)
    copilot.competency_coverage = coverage
    await db.commit()
    return {"coverage": coverage}


@router.post("/{copilot_id}/suggest")
async def get_suggestions(
    copilot_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager")),
    org_id: UUID = Depends(get_org_id),
):
    """Generate follow-up question suggestions."""
    copilot = await _get_copilot_with_org_check(db, copilot_id, org_id)
    if not copilot:
        raise HTTPException(status_code=404, detail="Copilot session not found")

    msg_result = await db.execute(
        select(InterviewMessage)
        .where(InterviewMessage.session_id == copilot.interview_session_id)
        .order_by(InterviewMessage.created_at)
    )
    messages = msg_result.scalars().all()
    recent = [{"role": m.role, "content": m.content} for m in messages[-4:]]
    recent_text = "\n".join(f"{m['role']}: {m['content']}" for m in recent)

    job_result = await db.execute(
        select(JobPosting).join(
            InterviewSession, InterviewSession.job_posting_id == JobPosting.id
        ).where(InterviewSession.id == copilot.interview_session_id)
    )
    job = job_result.scalar_one_or_none()
    skills = list(job.required_skills) if job and job.required_skills else []
    title = job.title if job else "Unknown Role"

    coverage = compute_coverage(skills, [{"content": m.content} for m in messages])
    uncovered = [s for s, v in coverage.items() if not v.get("covered")]

    elapsed = 0
    interview_result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == copilot.interview_session_id)
    )
    interview = interview_result.scalar_one_or_none()
    if interview and interview.started_at:
        elapsed = int((datetime.now(UTC) - interview.started_at).total_seconds() / 60)

    suggestions = await generate_suggestions(
        title, skills, uncovered, recent_text, elapsed
    )

    existing = copilot.suggestions or []
    existing.extend(suggestions)
    copilot.suggestions = existing
    await db.commit()

    return {"suggestions": suggestions, "uncovered_skills": uncovered}


@router.post("/{copilot_id}/check-legal")
async def check_legal(
    copilot_id: UUID,
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager")),
    org_id: UUID = Depends(get_org_id),
):
    """Check a question for legal/bias risks."""
    text = body.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="Question text required")
    result = await check_legal_risk(text)
    if result.get("is_risky"):
        copilot = await _get_copilot_with_org_check(db, copilot_id, org_id)
        if copilot:
            alerts = list(copilot.legal_alerts or [])
            alerts.append({"question": text, **result})
            copilot.legal_alerts = alerts
            await db.commit()
    return result


@router.post("/{copilot_id}/end")
async def end_copilot(
    copilot_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager")),
    org_id: UUID = Depends(get_org_id),
):
    """End a copilot session."""
    copilot = await _get_copilot_with_org_check(db, copilot_id, org_id)
    if not copilot:
        raise HTTPException(status_code=404, detail="Copilot session not found")
    copilot.status = "ended"
    copilot.ended_at = datetime.now(UTC)
    await db.commit()
    return {"status": "ended"}
