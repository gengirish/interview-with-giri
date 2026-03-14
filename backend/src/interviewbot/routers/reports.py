from __future__ import annotations

import csv
from datetime import UTC, datetime, timedelta
import io
import secrets
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.config import get_settings
from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import (
    CandidateReportResponse,
    DimensionalScore,
    PaginatedResponse,
)
from interviewbot.models.tables import CandidateReport, InterviewSession, JobPosting
from interviewbot.services.scoring_engine import score_interview

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("", response_model=PaginatedResponse)
async def list_reports(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    base_query = (
        select(
            CandidateReport.id,
            CandidateReport.session_id,
            InterviewSession.candidate_name,
            InterviewSession.overall_score,
            CandidateReport.recommendation,
            CandidateReport.created_at,
            JobPosting.title.label("job_title"),
        )
        .select_from(CandidateReport)
        .join(InterviewSession, CandidateReport.session_id == InterviewSession.id)
        .join(JobPosting, InterviewSession.job_posting_id == JobPosting.id)
        .where(InterviewSession.org_id == org_id)
    )

    count_stmt = select(func.count()).select_from(
        select(CandidateReport.id)
        .join(InterviewSession, CandidateReport.session_id == InterviewSession.id)
        .where(InterviewSession.org_id == org_id)
        .subquery()
    )
    total = (await db.execute(count_stmt)).scalar() or 0

    result = await db.execute(
        base_query.order_by(CandidateReport.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = result.all()

    items = [
        {
            "id": str(row.id),
            "session_id": str(row.session_id),
            "candidate_name": row.candidate_name,
            "overall_score": float(row.overall_score) if row.overall_score else None,
            "recommendation": row.recommendation,
            "created_at": row.created_at,
            "job_title": row.job_title,
        }
        for row in rows
    ]

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/debrief")
async def generate_debrief(
    body: dict = Body(...),
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI hiring debrief comparing multiple candidates."""
    session_ids = body.get("session_ids", [])
    if len(session_ids) < 2:
        raise HTTPException(400, "At least 2 candidates required for a debrief")
    if len(session_ids) > 5:
        raise HTTPException(400, "Maximum 5 candidates per debrief")

    org_id = UUID(str(user.get("org_id", "")))

    from interviewbot.models.tables import ReportComment

    candidates_data = []
    for sid in session_ids:
        try:
            sid_uuid = UUID(str(sid))
        except (ValueError, TypeError):
            continue

        session_result = await db.execute(
            select(InterviewSession).where(
                InterviewSession.id == sid_uuid,
                InterviewSession.org_id == org_id,
            )
        )
        session = session_result.scalar_one_or_none()
        if not session:
            continue

        report_result = await db.execute(
            select(CandidateReport).where(CandidateReport.session_id == sid_uuid)
        )
        report = report_result.scalar_one_or_none()

        comments = []
        if report:
            comment_result = await db.execute(
                select(ReportComment).where(ReportComment.report_id == report.id)
            )
            comments = [c.content for c in comment_result.scalars().all()]

        candidates_data.append(
            {
                "name": session.candidate_name or "Unknown",
                "email": session.candidate_email or "",
                "score": float(session.overall_score) if session.overall_score else None,
                "duration_minutes": (
                    round(session.duration_seconds / 60, 1) if session.duration_seconds else None
                ),
                "format": session.format,
                "report": {
                    "summary": report.ai_summary if report else None,
                    "strengths": report.strengths if report else [],
                    "concerns": report.concerns if report else [],
                    "recommendation": report.recommendation if report else None,
                    "confidence": (
                        float(report.confidence_score)
                        if report and report.confidence_score
                        else None
                    ),
                    "skill_scores": report.skill_scores if report else {},
                    "behavioral_scores": report.behavioral_scores if report else {},
                }
                if report
                else None,
                "team_comments": comments,
            }
        )

    if len(candidates_data) < 2:
        raise HTTPException(400, "Could not find enough valid candidate sessions")

    candidates_context = ""
    for i, c in enumerate(candidates_data, 1):
        candidates_context += f"\n### Candidate {i}: {c['name']}\n"
        candidates_context += f"- Score: {c['score']}/10\n"
        candidates_context += f"- Duration: {c['duration_minutes']} min\n"
        if c["report"]:
            r = c["report"]
            candidates_context += f"- Recommendation: {r['recommendation']}\n"
            candidates_context += f"- Confidence: {r['confidence']}\n"
            candidates_context += f"- Summary: {r['summary']}\n"
            candidates_context += f"- Strengths: {', '.join(r['strengths'])}\n"
            candidates_context += f"- Concerns: {', '.join(r['concerns'])}\n"
            if r["skill_scores"]:
                for skill, data in r["skill_scores"].items():
                    score = data.get("score", "N/A") if isinstance(data, dict) else data
                    candidates_context += f"  - {skill}: {score}/10\n"
        if c["team_comments"]:
            candidates_context += f"- Team Comments: {'; '.join(c['team_comments'][:5])}\n"

    table_header = " | ".join(c["name"] for c in candidates_data)
    table_sep = "|".join(["---"] * len(candidates_data))

    prompt = f"""You are a hiring committee advisor. Generate a structured debrief
document comparing these candidates.

## Candidates
{candidates_context}

## Required Output Format (Markdown)

# Hiring Debrief

## Executive Summary
[2-3 paragraph overview of the candidate pool, overall quality, and key differentiators]

## Side-by-Side Comparison

| Dimension | {table_header} |
|-----------|{table_sep}|
[Fill in key dimensions with scores and brief notes]

## Individual Assessments

[For each candidate:]
### [Name]
- **Overall Score:** X/10
- **Key Strengths:** [bullets]
- **Key Risks:** [bullets]
- **Best Fit For:** [role/team suggestion]

## Risk Assessment
[Identify risks for each candidate and mitigation strategies]

## Recommended Ranking
1. [Name] - [One-line rationale]
2. [Name] - [One-line rationale]
...

## Decision Recommendation
[Final recommendation with confidence level and suggested next steps]

---
*Generated by AI Interview Assistant*
"""

    from interviewbot.services.ai_engine import AIEngine

    engine = AIEngine()
    debrief = await engine.chat(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=4096,
    )

    return {
        "debrief": debrief,
        "candidates": [{"name": c["name"], "score": c["score"]} for c in candidates_data],
    }


async def _fetch_session_and_report(
    session_id: UUID, db: AsyncSession, org_id: UUID
) -> tuple[InterviewSession, CandidateReport]:
    """Fetch interview session and its report, raising 404 if not found."""
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")

    report_result = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == session_id)
    )
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not generated yet"
        )

    return session, report


@router.get("/public/{share_token}", response_model=CandidateReportResponse)
async def get_public_report(
    share_token: str,
    db: AsyncSession = Depends(get_db),
) -> CandidateReportResponse:
    """Access a shared report via public token (no auth required)."""
    result = await db.execute(
        select(CandidateReport).where(CandidateReport.share_token == share_token)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    if report.share_expires_at and report.share_expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_410_GONE, detail="This shared link has expired"
        )

    session_result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == report.session_id)
    )
    session = session_result.scalar_one_or_none()

    return _to_response(
        report,
        session.candidate_name if session else None,
        session.overall_score if session else None,
    )


@router.post("/{session_id}/generate", response_model=CandidateReportResponse)
async def generate_report(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> CandidateReportResponse:
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")
    if session.status != "completed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Interview not yet completed")

    report = await score_interview(str(session_id), db)
    if not report:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to generate report")

    return _to_response(report, session.candidate_name, session.overall_score)


@router.get("/{report_id}/engagement")
async def get_engagement(
    report_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Get engagement profile for a report."""
    result = await db.execute(
        select(CandidateReport).where(CandidateReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == report.session_id,
            InterviewSession.org_id == org_id,
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return {"engagement_profile": report.engagement_profile or {}}


@router.get("/{session_id}", response_model=CandidateReportResponse)
async def get_report(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> CandidateReportResponse:
    session, report = await _fetch_session_and_report(session_id, db, org_id)
    return _to_response(report, session.candidate_name, session.overall_score)


@router.get("/{session_id}/highlights")
async def get_highlights(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Get AI-generated highlights for an interview."""
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")

    report_result = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == session_id)
    )
    report = report_result.scalar_one_or_none()
    highlights: list[dict] = []
    if report:
        highlights = (report.extended_data or {}).get("highlights", [])

    # If no highlights exist yet, generate them on-demand
    if not highlights:
        from interviewbot.services.highlight_engine import generate_highlights

        highlights = await generate_highlights(str(session_id), db) or []
        if highlights and report:
            report.extended_data = {
                **(report.extended_data or {}),
                "highlights": highlights,
            }
            await db.commit()

    return {"highlights": highlights, "session_id": str(session_id)}


@router.get("/{session_id}/export/json")
async def export_report_json(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    """Export the full scorecard as structured JSON for ATS integration."""
    session, report = await _fetch_session_and_report(session_id, db, org_id)
    extended = report.extended_data or {}
    return {
        "export_version": "1.0",
        "candidate": {
            "name": session.candidate_name,
            "email": session.candidate_email,
        },
        "interview": {
            "id": str(session.id),
            "format": session.format,
            "duration_seconds": session.duration_seconds,
            "started_at": session.started_at.isoformat() if session.started_at else None,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        },
        "scores": {
            "overall": float(session.overall_score) if session.overall_score else None,
            "confidence": float(report.confidence_score) if report.confidence_score else None,
            "technical": report.skill_scores or {},
            "behavioral": report.behavioral_scores or {},
        },
        "assessment": {
            "summary": report.ai_summary,
            "recommendation": report.recommendation,
            "strengths": report.strengths or [],
            "concerns": report.concerns or [],
            "experience_level": extended.get("experience_level_assessment"),
            "hiring_level_fit": extended.get("hiring_level_fit"),
            "follow_up_areas": extended.get("suggested_follow_up_areas", []),
        },
    }


@router.get("/{session_id}/export/csv")
async def export_report_csv(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> StreamingResponse:
    """Export scorecard as CSV for spreadsheet import."""
    session, report = await _fetch_session_and_report(session_id, db, org_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Category", "Dimension", "Score", "Evidence", "Notes"])

    for dim_name, dim_data in (report.skill_scores or {}).items():
        if isinstance(dim_data, dict):
            writer.writerow(
                [
                    "Technical",
                    dim_name.replace("_", " ").title(),
                    dim_data.get("score", ""),
                    dim_data.get("evidence", ""),
                    dim_data.get("notes", ""),
                ]
            )

    for dim_name, dim_data in (report.behavioral_scores or {}).items():
        if isinstance(dim_data, dict):
            writer.writerow(
                [
                    "Behavioral",
                    dim_name.replace("_", " ").title(),
                    dim_data.get("score", ""),
                    dim_data.get("evidence", ""),
                    dim_data.get("notes", ""),
                ]
            )

    writer.writerow([])
    writer.writerow(
        ["Overall Score", float(session.overall_score) if session.overall_score else ""]
    )
    writer.writerow(["Recommendation", report.recommendation or ""])
    writer.writerow(["Summary", report.ai_summary or ""])

    output.seek(0)
    candidate_label = (session.candidate_name or "candidate").replace(" ", "_")
    filename = f"scorecard_{candidate_label}_{session_id}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{session_id}/share")
async def share_report(
    session_id: UUID,
    hours: int = Query(72, ge=1, le=720),
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Generate a shareable public link for a report (expires after N hours)."""
    _session, report = await _fetch_session_and_report(session_id, db, org_id)

    token = secrets.token_urlsafe(32)
    report.share_token = token
    report.share_expires_at = datetime.now(UTC) + timedelta(hours=hours)
    await db.commit()

    settings = get_settings()
    share_url = f"{settings.app_url}/reports/shared/{token}"
    return {
        "share_url": share_url,
        "share_token": token,
        "expires_at": report.share_expires_at.isoformat(),
    }


def _to_dimensional_score(v: dict) -> DimensionalScore:
    """Build DimensionalScore from dict; backward-compatible with old {score, evidence} format."""
    raw_score = v.get("score")
    score = float(raw_score) if raw_score is not None else None
    return DimensionalScore(
        score=score,
        evidence=v.get("evidence", ""),
        notes=v.get("notes", ""),
    )


def _to_response(
    report: CandidateReport,
    candidate_name: str | None,
    overall_score: float | None,
) -> CandidateReportResponse:
    skill_scores = {}
    for k, v in (report.skill_scores or {}).items():
        if isinstance(v, dict):
            skill_scores[k] = _to_dimensional_score(v)

    behavioral_scores = {}
    for k, v in (report.behavioral_scores or {}).items():
        if isinstance(v, dict):
            behavioral_scores[k] = _to_dimensional_score(v)

    extended = report.extended_data or {}
    return CandidateReportResponse(
        id=report.id,
        session_id=report.session_id,
        candidate_name=candidate_name,
        overall_score=float(overall_score) if overall_score else None,
        skill_scores=skill_scores,
        behavioral_scores=behavioral_scores,
        ai_summary=report.ai_summary,
        strengths=report.strengths or [],
        concerns=report.concerns or [],
        recommendation=report.recommendation,
        confidence_score=float(report.confidence_score) if report.confidence_score else None,
        experience_level_assessment=extended.get("experience_level_assessment") or None,
        suggested_follow_up_areas=extended.get("suggested_follow_up_areas", []),
        hiring_level_fit=extended.get("hiring_level_fit") or None,
        created_at=report.created_at,
    )
