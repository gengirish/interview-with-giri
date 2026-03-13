from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import DashboardStats
from interviewbot.models.tables import InterviewSession, JobPosting

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _org_filter(org_id):
    return InterviewSession.org_id == org_id


_completed = InterviewSession.status == "completed"
_passed = and_(_completed, InterviewSession.overall_score >= 6.0)


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> DashboardStats:
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    base = _org_filter(org_id)

    # Query 1: All interview session stats in one round-trip
    session_stmt = select(
        func.count(InterviewSession.id).label("total"),
        func.count(case((_completed, 1))).label("completed"),
        func.count(case((InterviewSession.created_at >= month_start, 1))).label("this_month"),
        func.count(case((_passed, 1))).label("passed"),
        func.avg(InterviewSession.overall_score).label("avg_score"),
    ).where(base)
    session_row = (await db.execute(session_stmt)).one()

    total_interviews = session_row.total or 0
    completed_interviews = session_row.completed or 0
    interviews_this_month = session_row.this_month or 0
    passed = session_row.passed or 0
    avg_score_raw = session_row.avg_score
    avg_score = round(float(avg_score_raw), 1) if avg_score_raw else None

    pass_rate = (
        round((passed / completed_interviews) * 100, 1) if completed_interviews > 0 else None
    )

    # Query 2: Active jobs count
    jobs_result = await db.execute(
        select(func.count()).select_from(
            select(JobPosting)
            .where(JobPosting.org_id == org_id, JobPosting.is_active == True)  # noqa: E712
            .subquery()
        )
    )
    active_jobs = jobs_result.scalar() or 0

    return DashboardStats(
        total_interviews=total_interviews,
        completed_interviews=completed_interviews,
        active_jobs=active_jobs,
        avg_score=avg_score,
        interviews_this_month=interviews_this_month,
        pass_rate=pass_rate,
    )
