from __future__ import annotations

import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import CandidateReportResponse, DimensionalScore
from interviewbot.models.tables import CandidateReport, InterviewSession
from interviewbot.services.scoring_engine import score_interview

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("/{session_id}/generate", response_model=CandidateReportResponse)
async def generate_report(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),  # noqa: B006
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


@router.get("/{session_id}", response_model=CandidateReportResponse)
async def get_report(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),  # noqa: B006
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

    report_result = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == session_id)
    )
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not generated yet")

    return _to_response(report, session.candidate_name, session.overall_score)


@router.get("/{session_id}/export/json")
async def export_report_json(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    """Export the full scorecard as structured JSON for ATS integration."""
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")

    report_result = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == session_id)
    )
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not generated yet")

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
    user: dict = Depends(require_role("admin", "hiring_manager")),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> StreamingResponse:
    """Export scorecard as CSV for spreadsheet import."""
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")

    report_result = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == session_id)
    )
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not generated yet")

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
