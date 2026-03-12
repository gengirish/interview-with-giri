from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import AnalyticsOverviewResponse, JobAnalyticsResponse
from interviewbot.models.tables import InterviewSession, JobPosting

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def analytics_overview(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> AnalyticsOverviewResponse:
    total_q = select(func.count()).select_from(
        select(InterviewSession).where(InterviewSession.org_id == org_id).subquery()
    )
    total = (await db.execute(total_q)).scalar() or 0

    completed_q = select(func.count()).select_from(
        select(InterviewSession)
        .where(InterviewSession.org_id == org_id, InterviewSession.status == "completed")
        .subquery()
    )
    completed = (await db.execute(completed_q)).scalar() or 0

    avg_score = (
        await db.execute(
            select(func.avg(InterviewSession.overall_score)).where(
                InterviewSession.org_id == org_id,
                InterviewSession.overall_score.isnot(None),
            )
        )
    ).scalar()

    avg_duration = (
        await db.execute(
            select(func.avg(InterviewSession.duration_seconds)).where(
                InterviewSession.org_id == org_id,
                InterviewSession.duration_seconds.isnot(None),
            )
        )
    ).scalar()

    score_dist_result = await db.execute(
        select(
            case(
                (InterviewSession.overall_score < 4, "0-3.9"),
                (InterviewSession.overall_score < 6, "4-5.9"),
                (InterviewSession.overall_score < 8, "6-7.9"),
                else_="8-10",
            ).label("range"),
            func.count().label("count"),
        )
        .where(
            InterviewSession.org_id == org_id,
            InterviewSession.overall_score.isnot(None),
        )
        .group_by("range")
    )
    score_distribution = {row.range: row.count for row in score_dist_result}

    status_result = await db.execute(
        select(
            InterviewSession.status,
            func.count().label("count"),
        )
        .where(InterviewSession.org_id == org_id)
        .group_by(InterviewSession.status)
    )
    status_breakdown = {row.status: row.count for row in status_result}

    format_result = await db.execute(
        select(
            InterviewSession.format,
            func.count().label("count"),
        )
        .where(InterviewSession.org_id == org_id)
        .group_by(InterviewSession.format)
    )
    format_breakdown = {row.format: row.count for row in format_result}

    return AnalyticsOverviewResponse(
        total_interviews=total,
        completed_interviews=completed,
        completion_rate=round((completed / total * 100), 1) if total > 0 else 0,
        avg_score=round(float(avg_score), 1) if avg_score else None,
        avg_duration_minutes=round(float(avg_duration) / 60, 1) if avg_duration else None,
        score_distribution=score_distribution,
        status_breakdown=status_breakdown,
        format_breakdown=format_breakdown,
    )


@router.get("/per-job", response_model=list[JobAnalyticsResponse])
async def analytics_per_job(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[JobAnalyticsResponse]:
    stmt = (
        select(
            JobPosting.id,
            JobPosting.title,
            JobPosting.role_type,
            JobPosting.is_active,
            func.count(InterviewSession.id).label("total_interviews"),
            func.count(InterviewSession.completed_at).label("completed_interviews"),
            func.avg(InterviewSession.overall_score).label("avg_score"),
            func.avg(InterviewSession.duration_seconds).label("avg_duration"),
        )
        .select_from(JobPosting)
        .outerjoin(
            InterviewSession,
            (JobPosting.id == InterviewSession.job_posting_id)
            & (InterviewSession.org_id == org_id),
        )
        .where(JobPosting.org_id == org_id)
        .group_by(
            JobPosting.id,
            JobPosting.title,
            JobPosting.role_type,
            JobPosting.is_active,
            JobPosting.created_at,
        )
        .order_by(JobPosting.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    return [
        JobAnalyticsResponse(
            job_id=str(row.id),
            title=row.title,
            role_type=row.role_type,
            is_active=row.is_active,
            total_interviews=row.total_interviews or 0,
            completed_interviews=row.completed_interviews or 0,
            avg_score=round(float(row.avg_score), 1) if row.avg_score else None,
            avg_duration_minutes=round(float(row.avg_duration) / 60, 1)
            if row.avg_duration
            else None,
        )
        for row in rows
    ]
