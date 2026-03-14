"""Organizational Hiring Knowledge Base API."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import (
    KnowledgeEntryResponse,
    KnowledgeQueryRequest,
    KnowledgeQueryResponse,
)
from interviewbot.models.tables import (
    CandidateReport,
    InterviewSession,
    JobPosting,
    KnowledgeEntry,
    KnowledgeQueryLog,
)
from interviewbot.services.knowledge_engine import (
    extract_knowledge,
    generate_suggestions,
    query_knowledge,
)

router = APIRouter(prefix="/knowledge", tags=["Knowledge"])


async def get_org_stats(db: AsyncSession, org_id: UUID) -> dict:
    """Compute org stats: total_interviews, avg_score, pass_rate, top_roles."""
    _completed = InterviewSession.status == "completed"
    base = InterviewSession.org_id == org_id

    # Count completed, avg score
    stmt = select(
        func.count(InterviewSession.id).label("total"),
        func.avg(InterviewSession.overall_score).label("avg_score"),
    ).where(and_(base, _completed))
    row = (await db.execute(stmt)).one()
    total = row.total or 0
    avg_score = round(float(row.avg_score), 1) if row.avg_score else "N/A"

    # Pass rate: sessions with recommendation hire/strong_hire
    pass_stmt = (
        select(func.count(InterviewSession.id))
        .select_from(InterviewSession)
        .join(CandidateReport, CandidateReport.session_id == InterviewSession.id)
        .where(
            base,
            _completed,
            CandidateReport.recommendation.in_(("hire", "strong_hire")),
        )
    )
    passed = (await db.execute(pass_stmt)).scalar() or 0
    pass_rate = round((passed / total) * 100, 1) if total > 0 else "N/A"

    # Top 5 role types
    role_stmt = (
        select(JobPosting.role_type, func.count(InterviewSession.id).label("cnt"))
        .select_from(InterviewSession)
        .join(JobPosting, InterviewSession.job_posting_id == JobPosting.id)
        .where(base, _completed)
        .group_by(JobPosting.role_type)
        .order_by(func.count(InterviewSession.id).desc())
        .limit(5)
    )
    role_rows = (await db.execute(role_stmt)).all()
    top_roles = [r.role_type for r in role_rows]

    return {
        "total_interviews": total,
        "avg_score": avg_score,
        "pass_rate": pass_rate,
        "top_roles": top_roles,
    }


async def get_org_stats_recent(db: AsyncSession, org_id: UUID, days: int = 30) -> dict:
    """Stats for last N days (for suggestions)."""
    cutoff = datetime.now(UTC) - timedelta(days=days)
    _completed = InterviewSession.status == "completed"
    base = and_(InterviewSession.org_id == org_id, InterviewSession.completed_at >= cutoff)

    stmt = select(
        func.count(InterviewSession.id).label("total"),
        func.avg(InterviewSession.overall_score).label("avg_score"),
    ).where(base, _completed)
    row = (await db.execute(stmt)).one()
    total = row.total or 0
    avg_score = round(float(row.avg_score), 1) if row.avg_score else "N/A"

    pass_stmt = (
        select(func.count(InterviewSession.id))
        .select_from(InterviewSession)
        .join(CandidateReport, CandidateReport.session_id == InterviewSession.id)
        .where(
            base,
            CandidateReport.recommendation.in_(("hire", "strong_hire")),
        )
    )
    passed = (await db.execute(pass_stmt)).scalar() or 0
    pass_rate = round((passed / total) * 100, 1) if total > 0 else "N/A"

    role_stmt = (
        select(JobPosting.role_type, func.count(InterviewSession.id).label("cnt"))
        .select_from(InterviewSession)
        .join(JobPosting, InterviewSession.job_posting_id == JobPosting.id)
        .where(base)
        .group_by(JobPosting.role_type)
        .order_by(func.count(InterviewSession.id).desc())
        .limit(5)
    )
    role_rows = (await db.execute(role_stmt)).all()
    top_roles = [r.role_type for r in role_rows]

    return {
        "total_interviews": total,
        "avg_score": avg_score,
        "pass_rate": pass_rate,
        "top_roles": top_roles,
    }


@router.post("/query", response_model=KnowledgeQueryResponse)
async def post_query(
    body: KnowledgeQueryRequest,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> KnowledgeQueryResponse:
    """Natural language query against the hiring knowledge base."""
    query = (body.query or "").strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query is required",
        )

    # Fetch knowledge entries - simple relevance: query words in title/content
    words = [w for w in query.lower().split() if len(w) > 2]
    entry_query = select(KnowledgeEntry).where(KnowledgeEntry.org_id == org_id)
    if words:
        conditions = []
        for w in words:
            conditions.append(KnowledgeEntry.title.ilike(f"%{w}%"))
            conditions.append(KnowledgeEntry.content.ilike(f"%{w}%"))
        entry_query = entry_query.where(or_(*conditions))
    entry_query = entry_query.order_by(KnowledgeEntry.updated_at.desc()).limit(15)
    result = await db.execute(entry_query)
    entries = result.scalars().all()

    knowledge_dicts = [
        {
            "id": str(e.id),
            "category": e.category,
            "title": e.title,
            "content": e.content,
        }
        for e in entries
    ]

    stats = await get_org_stats(db, org_id)
    answer = await query_knowledge(query, knowledge_dicts, stats)

    sources = [{"id": str(e.id), "title": e.title, "category": e.category} for e in entries]

    # Log the query
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User context required")
    log_entry = KnowledgeQueryLog(
        org_id=org_id,
        user_id=UUID(str(user_id)),
        query=query,
        response=answer,
        sources=sources,
    )
    db.add(log_entry)
    await db.commit()
    await db.refresh(log_entry)

    return KnowledgeQueryResponse(
        answer=answer,
        sources=sources,
        query_id=log_entry.id,
    )


@router.get("/entries")
async def list_entries(
    category: str | None = Query(None, description="Filter by category"),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """List knowledge entries, optionally filtered by category."""
    q = select(KnowledgeEntry).where(KnowledgeEntry.org_id == org_id)
    if category and category.strip():
        q = q.where(KnowledgeEntry.category == category.strip())
    q = q.order_by(KnowledgeEntry.updated_at.desc())
    result = await db.execute(q)
    entries = result.scalars().all()
    return {
        "items": [KnowledgeEntryResponse.model_validate(e) for e in entries],
        "total": len(entries),
    }


@router.get("/entries/{entry_id}", response_model=KnowledgeEntryResponse)
async def get_entry(
    entry_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> KnowledgeEntryResponse:
    """Get a single knowledge entry."""
    result = await db.execute(
        select(KnowledgeEntry).where(
            KnowledgeEntry.id == entry_id,
            KnowledgeEntry.org_id == org_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge entry not found",
        )
    return KnowledgeEntryResponse.model_validate(entry)


@router.post("/generate")
async def post_generate(
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Trigger knowledge extraction from completed interviews."""
    # Fetch completed interviews with reports, grouped by role_type
    stmt = (
        select(
            InterviewSession.id,
            InterviewSession.candidate_name,
            InterviewSession.candidate_email,
            InterviewSession.overall_score,
            InterviewSession.completed_at,
            JobPosting.role_type,
            JobPosting.title.label("job_title"),
        )
        .select_from(InterviewSession)
        .join(JobPosting, InterviewSession.job_posting_id == JobPosting.id)
        .where(
            InterviewSession.org_id == org_id,
            InterviewSession.status == "completed",
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Also fetch reports for summary data
    session_ids = [r.id for r in rows]
    report_stmt = select(CandidateReport).where(CandidateReport.session_id.in_(session_ids))
    report_result = await db.execute(report_stmt)
    reports = {r.session_id: r for r in report_result.scalars().all()}

    # Group by role_type
    by_role: dict[str, list[dict]] = {}
    for r in rows:
        role = r.role_type or "unknown"
        if role not in by_role:
            by_role[role] = []
        report = reports.get(r.id)
        by_role[role].append(
            {
                "session_id": str(r.id),
                "candidate_name": r.candidate_name,
                "candidate_email": r.candidate_email,
                "overall_score": float(r.overall_score) if r.overall_score else None,
                "job_title": r.job_title,
                "ai_summary": report.ai_summary[:500] if report and report.ai_summary else None,
                "recommendation": report.recommendation if report else None,
                "strengths": report.strengths[:5] if report and report.strengths else [],
                "concerns": report.concerns[:5] if report and report.concerns else [],
            }
        )

    created = 0
    for role_type, interviews_data in by_role.items():
        if len(interviews_data) < 2:
            continue
        entries = await extract_knowledge(interviews_data, role_type)
        for e in entries:
            if not isinstance(e, dict):
                continue
            cat = e.get("category") or "general"
            title = e.get("title") or "Untitled"
            content = e.get("content") or ""
            conf = e.get("confidence")
            tags = e.get("tags") or []
            entry = KnowledgeEntry(
                org_id=org_id,
                category=cat,
                title=title,
                content=content,
                source_data={"role_type": role_type, "interview_count": len(interviews_data)},
                confidence=float(conf) if conf is not None else None,
                tags=tags,
                is_auto_generated=True,
            )
            db.add(entry)
            created += 1

    await db.commit()
    return {"status": "ok", "entries_created": created}


@router.get("/suggestions")
async def get_suggestions(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Generate proactive insights based on recent hiring data."""
    stats = await get_org_stats_recent(db, org_id, days=30)
    suggestions = await generate_suggestions(stats)
    return {"suggestions": suggestions}


class RateRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)


@router.post("/query/{query_id}/rate")
async def rate_query(
    query_id: UUID,
    body: RateRequest,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Rate a query response (1-5)."""
    result = await db.execute(
        select(KnowledgeQueryLog).where(
            KnowledgeQueryLog.id == query_id,
            KnowledgeQueryLog.org_id == org_id,
        )
    )
    log_entry = result.scalar_one_or_none()
    if not log_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Query log not found",
        )
    log_entry.rating = body.rating
    await db.commit()
    return {"status": "ok", "rating": body.rating}


@router.get("/popular-queries")
async def get_popular_queries(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Most common queries (group by query text, count, order desc)."""
    stmt = (
        select(KnowledgeQueryLog.query, func.count(KnowledgeQueryLog.id).label("cnt"))
        .where(KnowledgeQueryLog.org_id == org_id)
        .group_by(KnowledgeQueryLog.query)
        .order_by(func.count(KnowledgeQueryLog.id).desc())
        .limit(10)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return {
        "queries": [{"query": r.query, "count": r.cnt} for r in rows],
    }
