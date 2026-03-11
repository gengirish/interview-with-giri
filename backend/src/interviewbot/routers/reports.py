from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import CandidateReportResponse, SkillScore, BehavioralScore
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


def _to_response(
    report: CandidateReport,
    candidate_name: str | None,
    overall_score: float | None,
) -> CandidateReportResponse:
    skill_scores = {}
    for k, v in (report.skill_scores or {}).items():
        if isinstance(v, dict):
            skill_scores[k] = SkillScore(
                score=float(v.get("score", 0)),
                evidence=v.get("evidence", ""),
            )

    behavioral_scores = {}
    for k, v in (report.behavioral_scores or {}).items():
        if isinstance(v, dict):
            behavioral_scores[k] = BehavioralScore(
                score=float(v.get("score", 0)),
                evidence=v.get("evidence", ""),
            )

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
        created_at=report.created_at,
    )
