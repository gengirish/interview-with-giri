from collections import defaultdict
import contextlib
from datetime import UTC, datetime, timedelta
import json
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import AnalyticsOverviewResponse, JobAnalyticsResponse
from interviewbot.models.tables import CandidateReport, InterviewSession, JobPosting

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _parse_date(s: str) -> datetime | None:
    if not s:
        return None
    try:
        d = datetime.strptime(s.strip(), "%Y-%m-%d")
        return d.replace(tzinfo=UTC)
    except ValueError:
        return None


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def analytics_overview(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> AnalyticsOverviewResponse:
    base_conds = [InterviewSession.org_id == org_id]
    if date_from:
        parsed = _parse_date(date_from)
        if parsed:
            base_conds.append(InterviewSession.created_at >= parsed)
    if date_to:
        parsed = _parse_date(date_to)
        if parsed:
            base_conds.append(InterviewSession.created_at <= parsed + timedelta(days=1))

    total_q = select(func.count()).select_from(
        select(InterviewSession).where(*base_conds).subquery()
    )
    total = (await db.execute(total_q)).scalar() or 0

    completed_conds = base_conds + [InterviewSession.status == "completed"]
    completed_q = select(func.count()).select_from(
        select(InterviewSession).where(*completed_conds).subquery()
    )
    completed = (await db.execute(completed_q)).scalar() or 0

    avg_score_conds = base_conds + [InterviewSession.overall_score.isnot(None)]
    avg_score = (
        await db.execute(select(func.avg(InterviewSession.overall_score)).where(*avg_score_conds))
    ).scalar()

    avg_duration_conds = base_conds + [InterviewSession.duration_seconds.isnot(None)]
    avg_duration = (
        await db.execute(
            select(func.avg(InterviewSession.duration_seconds)).where(*avg_duration_conds)
        )
    ).scalar()

    score_dist_conds = base_conds + [InterviewSession.overall_score.isnot(None)]
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
        .where(*score_dist_conds)
        .group_by("range")
    )
    score_distribution = {row.range: row.count for row in score_dist_result}

    status_result = await db.execute(
        select(
            InterviewSession.status,
            func.count().label("count"),
        )
        .where(*base_conds)
        .group_by(InterviewSession.status)
    )
    status_breakdown = {row.status: row.count for row in status_result}

    format_result = await db.execute(
        select(
            InterviewSession.format,
            func.count().label("count"),
        )
        .where(*base_conds)
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
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[JobAnalyticsResponse]:
    join_conds = [
        JobPosting.id == InterviewSession.job_posting_id,
        InterviewSession.org_id == org_id,
    ]
    if date_from:
        parsed = _parse_date(date_from)
        if parsed:
            join_conds.append(InterviewSession.created_at >= parsed)
    if date_to:
        parsed = _parse_date(date_to)
        if parsed:
            join_conds.append(InterviewSession.created_at <= parsed + timedelta(days=1))

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
        .outerjoin(InterviewSession, and_(*join_conds))
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


@router.get("/compare")
async def compare_candidates(
    job_id: UUID = Query(...),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[dict]:
    """Return all completed candidates for a job with their scores for comparison."""
    result = await db.execute(
        select(
            InterviewSession.id,
            InterviewSession.candidate_name,
            InterviewSession.candidate_email,
            InterviewSession.overall_score,
            InterviewSession.duration_seconds,
            InterviewSession.completed_at,
            InterviewSession.is_shortlisted,
            CandidateReport.skill_scores,
            CandidateReport.behavioral_scores,
            CandidateReport.recommendation,
            CandidateReport.confidence_score,
            CandidateReport.strengths,
            CandidateReport.concerns,
            CandidateReport.ai_summary,
        )
        .select_from(InterviewSession)
        .outerjoin(CandidateReport, CandidateReport.session_id == InterviewSession.id)
        .where(
            InterviewSession.job_posting_id == job_id,
            InterviewSession.org_id == org_id,
            InterviewSession.status == "completed",
        )
        .order_by(InterviewSession.overall_score.desc().nullslast())
    )
    rows = result.all()

    return [
        {
            "session_id": str(r.id),
            "candidate_name": r.candidate_name,
            "candidate_email": r.candidate_email,
            "overall_score": float(r.overall_score) if r.overall_score else None,
            "duration_seconds": r.duration_seconds,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "is_shortlisted": r.is_shortlisted,
            "skill_scores": r.skill_scores or {},
            "behavioral_scores": r.behavioral_scores or {},
            "recommendation": r.recommendation,
            "confidence_score": float(r.confidence_score) if r.confidence_score else None,
            "strengths": r.strengths or [],
            "concerns": r.concerns or [],
            "ai_summary": r.ai_summary,
        }
        for r in rows
    ]


@router.get("/skills-insights")
async def get_skills_insights(
    job_id: str | None = Query(None),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Get skills gap analysis and market insights."""
    query = (
        select(CandidateReport, InterviewSession)
        .join(InterviewSession, InterviewSession.id == CandidateReport.session_id)
        .where(
            InterviewSession.org_id == org_id,
            InterviewSession.status == "completed",
        )
    )
    if job_id:
        query = query.where(InterviewSession.job_posting_id == UUID(job_id))

    result = await db.execute(query)
    rows = result.all()

    if not rows:
        return {
            "total_candidates": 0,
            "skill_averages": {},
            "skill_gaps": [],
            "skill_strengths": [],
            "recommendations": [],
            "behavioral_averages": {},
        }

    skill_scores: dict[str, list[float]] = defaultdict(list)
    behavioral_scores: dict[str, list[float]] = defaultdict(list)

    for report, _session in rows:
        if report.skill_scores:
            for skill, data in report.skill_scores.items():
                score = data.get("score") if isinstance(data, dict) else data
                if score is not None:
                    with contextlib.suppress(ValueError, TypeError):
                        skill_scores[skill].append(float(score))
        if report.behavioral_scores:
            for dim, data in report.behavioral_scores.items():
                score = data.get("score") if isinstance(data, dict) else data
                if score is not None:
                    with contextlib.suppress(ValueError, TypeError):
                        behavioral_scores[dim].append(float(score))

    skill_averages = {
        skill: {
            "avg": round(sum(scores) / len(scores), 2),
            "min": round(min(scores), 2),
            "max": round(max(scores), 2),
            "count": len(scores),
            "std_dev": round(
                (sum((s - sum(scores) / len(scores)) ** 2 for s in scores) / len(scores)) ** 0.5,
                2,
            ),
        }
        for skill, scores in skill_scores.items()
        if scores
    }

    behavioral_averages = {
        dim: {
            "avg": round(sum(scores) / len(scores), 2),
            "count": len(scores),
        }
        for dim, scores in behavioral_scores.items()
        if scores
    }

    skill_gaps = sorted(
        [{"skill": k, **v} for k, v in skill_averages.items() if v["avg"] < 5.0],
        key=lambda x: x["avg"],
    )
    skill_strengths = sorted(
        [{"skill": k, **v} for k, v in skill_averages.items() if v["avg"] >= 7.0],
        key=lambda x: -x["avg"],
    )

    recommendations = []
    if skill_gaps:
        gap_text = ", ".join(f"{g['skill']} (avg: {g['avg']})" for g in skill_gaps[:5])
        strength_text = ", ".join(f"{s['skill']} (avg: {s['avg']})" for s in skill_strengths[:5])

        prompt = f"""Based on interview data analysis:
- Skills gaps (low scores): {gap_text}
- Skills strengths (high scores): {strength_text}
- Total candidates evaluated: {len(rows)}

Provide 3-5 concise, actionable recommendations for the hiring team. Each should be 1-2 sentences.
Focus on: adjusting job descriptions, improving sourcing, modifying interview focus areas.

Return JSON: {{"recommendations": ["rec1", "rec2", ...]}}"""

        try:
            from interviewbot.services.ai_engine import AIEngine

            engine = AIEngine()
            raw = await engine.chat([{"role": "user", "content": prompt}], temperature=0.3)
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
            data = json.loads(cleaned)
            recommendations = data.get("recommendations", [])
        except Exception:
            recommendations = []

    return {
        "total_candidates": len(rows),
        "skill_averages": skill_averages,
        "behavioral_averages": behavioral_averages,
        "skill_gaps": skill_gaps,
        "skill_strengths": skill_strengths,
        "recommendations": recommendations,
    }
