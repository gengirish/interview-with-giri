from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import (
    InterviewMessageResponse,
    InterviewSessionResponse,
    InterviewStartRequest,
    PaginatedResponse,
)
from interviewbot.models.tables import InterviewMessage, InterviewSession, JobPosting

router = APIRouter(prefix="/interviews", tags=["Interviews"])


# --- Authenticated endpoints (dashboard) ---


@router.get("", response_model=PaginatedResponse)
async def list_interviews(
    job_id: UUID | None = None,
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> PaginatedResponse:
    query = select(InterviewSession).where(InterviewSession.org_id == org_id)

    if job_id:
        query = query.where(InterviewSession.job_posting_id == job_id)
    if status_filter:
        query = query.where(InterviewSession.status == status_filter)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0

    result = await db.execute(
        query.order_by(InterviewSession.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    sessions = result.scalars().all()

    return PaginatedResponse(
        items=[_session_to_response(s) for s in sessions],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{session_id}", response_model=InterviewSessionResponse)
async def get_interview(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> InterviewSessionResponse:
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")
    return _session_to_response(session)


@router.get("/{session_id}/messages", response_model=list[InterviewMessageResponse])
async def get_interview_messages(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[InterviewMessageResponse]:
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")

    result = await db.execute(
        select(InterviewMessage)
        .where(InterviewMessage.session_id == session_id)
        .order_by(InterviewMessage.created_at.asc())
    )
    messages = result.scalars().all()
    return [
        InterviewMessageResponse(
            id=m.id,
            role=m.role,
            content=m.content,
            media_url=m.media_url,
            created_at=m.created_at,
        )
        for m in messages
    ]


# --- Public endpoints (candidate-facing) ---


@router.get("/public/{token}")
async def get_public_interview(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")

    job_result = await db.execute(
        select(JobPosting).where(JobPosting.id == session.job_posting_id)
    )
    job = job_result.scalar_one_or_none()

    return {
        "token": session.token,
        "status": session.status,
        "format": session.format,
        "job_title": job.title if job else "Unknown Position",
        "job_description": job.job_description[:500] if job else "",
        "interview_config": job.interview_config if job else {},
    }


@router.post("/public/{token}/start")
async def start_public_interview(
    token: str,
    req: InterviewStartRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")

    if session.status in ("completed",):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Interview already completed")

    session.candidate_name = req.candidate_name
    session.candidate_email = req.candidate_email
    session.status = "in_progress"
    session.started_at = datetime.now(UTC)
    await db.commit()

    return {
        "token": session.token,
        "status": session.status,
        "message": "Ready to begin. Connect via WebSocket to start the interview.",
    }


def _session_to_response(session: InterviewSession) -> InterviewSessionResponse:
    return InterviewSessionResponse(
        id=session.id,
        job_posting_id=session.job_posting_id,
        token=session.token,
        candidate_name=session.candidate_name,
        candidate_email=session.candidate_email,
        status=session.status,
        format=session.format or "text",
        overall_score=float(session.overall_score) if session.overall_score else None,
        duration_seconds=session.duration_seconds,
        started_at=session.started_at,
        completed_at=session.completed_at,
        created_at=session.created_at,
    )
