from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.tables import InterviewSession, JobPosting

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/overview")
async def analytics_overview(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
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

    return {
        "total_interviews": total,
        "completed_interviews": completed,
        "completion_rate": round((completed / total * 100), 1) if total > 0 else 0,
        "avg_score": round(float(avg_score), 1) if avg_score else None,
        "avg_duration_minutes": round(float(avg_duration) / 60, 1) if avg_duration else None,
        "score_distribution": score_distribution,
        "status_breakdown": status_breakdown,
        "format_breakdown": format_breakdown,
    }


@router.get("/per-job")
async def analytics_per_job(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[dict]:
    jobs_result = await db.execute(
        select(JobPosting)
        .where(JobPosting.org_id == org_id)
        .order_by(JobPosting.created_at.desc())
    )
    jobs = jobs_result.scalars().all()

    results = []
    for job in jobs:
        stats_result = await db.execute(
            select(
                func.count().label("total"),
                func.count(InterviewSession.completed_at).label("completed"),
                func.avg(InterviewSession.overall_score).label("avg_score"),
                func.avg(InterviewSession.duration_seconds).label("avg_duration"),
            ).where(InterviewSession.job_posting_id == job.id)
        )
        stats = stats_result.one()

        results.append(
            {
                "job_id": str(job.id),
                "title": job.title,
                "role_type": job.role_type,
                "is_active": job.is_active,
                "total_interviews": stats.total or 0,
                "completed_interviews": stats.completed or 0,
                "avg_score": round(float(stats.avg_score), 1) if stats.avg_score else None,
                "avg_duration_minutes": round(float(stats.avg_duration) / 60, 1)
                if stats.avg_duration
                else None,
            }
        )

    return results
