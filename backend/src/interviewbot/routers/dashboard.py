from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_current_user, get_db, get_org_id
from interviewbot.models.schemas import DashboardStats
from interviewbot.models.tables import InterviewSession, JobPosting

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    user: dict = Depends(get_current_user),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> DashboardStats:
    total_result = await db.execute(
        select(func.count()).select_from(
            select(InterviewSession).where(InterviewSession.org_id == org_id).subquery()
        )
    )
    total_interviews = total_result.scalar() or 0

    completed_result = await db.execute(
        select(func.count()).select_from(
            select(InterviewSession)
            .where(InterviewSession.org_id == org_id, InterviewSession.status == "completed")
            .subquery()
        )
    )
    completed_interviews = completed_result.scalar() or 0

    jobs_result = await db.execute(
        select(func.count()).select_from(
            select(JobPosting)
            .where(JobPosting.org_id == org_id, JobPosting.is_active == True)  # noqa: E712
            .subquery()
        )
    )
    active_jobs = jobs_result.scalar() or 0

    avg_result = await db.execute(
        select(func.avg(InterviewSession.overall_score)).where(
            InterviewSession.org_id == org_id,
            InterviewSession.overall_score.isnot(None),
        )
    )
    avg_score_raw = avg_result.scalar()
    avg_score = round(float(avg_score_raw), 1) if avg_score_raw else None

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_result = await db.execute(
        select(func.count()).select_from(
            select(InterviewSession)
            .where(
                InterviewSession.org_id == org_id,
                InterviewSession.created_at >= month_start,
            )
            .subquery()
        )
    )
    interviews_this_month = month_result.scalar() or 0

    pass_rate = None
    if completed_interviews > 0:
        pass_result = await db.execute(
            select(func.count()).select_from(
                select(InterviewSession)
                .where(
                    InterviewSession.org_id == org_id,
                    InterviewSession.status == "completed",
                    InterviewSession.overall_score >= 6.0,
                )
                .subquery()
            )
        )
        passed = pass_result.scalar() or 0
        pass_rate = round((passed / completed_interviews) * 100, 1)

    return DashboardStats(
        total_interviews=total_interviews,
        completed_interviews=completed_interviews,
        active_jobs=active_jobs,
        avg_score=avg_score,
        interviews_this_month=interviews_this_month,
        pass_rate=pass_rate,
    )
