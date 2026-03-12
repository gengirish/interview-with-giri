"""ATS integration endpoints for connecting to external applicant tracking systems."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
import structlog

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import (
    ATSConfig,
    ATSConfigResponse,
    ATSPushRequest,
    ATSPushResponse,
)
from interviewbot.models.tables import CandidateReport, InterviewSession, Organization
from interviewbot.services.ats_integration import push_to_ats

logger = structlog.get_logger()
router = APIRouter(prefix="/ats", tags=["ATS Integration"])


@router.get("/config", response_model=list[ATSConfigResponse])
async def get_ats_configs(
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[ATSConfigResponse]:
    org = await _get_org(db, org_id)
    configs = (org.settings or {}).get("ats_integrations", [])
    return [
        ATSConfigResponse(platform=c["platform"], enabled=c.get("enabled", True)) for c in configs
    ]


@router.post("/config")
async def save_ats_config(
    config: ATSConfig,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    org = await _get_org(db, org_id)
    settings = dict(org.settings or {})
    integrations = settings.get("ats_integrations", [])

    # Upsert: replace existing config for same platform
    integrations = [i for i in integrations if i.get("platform") != config.platform]
    integrations.append(config.model_dump())
    settings["ats_integrations"] = integrations
    org.settings = settings
    flag_modified(org, "settings")
    await db.commit()

    return {"status": "saved", "platform": config.platform}


@router.delete("/config/{platform}")
async def delete_ats_config(
    platform: Literal["greenhouse", "lever", "workable"],
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    org = await _get_org(db, org_id)
    settings = dict(org.settings or {})
    integrations = settings.get("ats_integrations", [])
    integrations = [i for i in integrations if i.get("platform") != platform]
    settings["ats_integrations"] = integrations
    org.settings = settings
    flag_modified(org, "settings")
    await db.commit()
    return {"status": "deleted", "platform": platform}


@router.post("/push", response_model=ATSPushResponse)
async def push_scorecard_to_ats(
    req: ATSPushRequest,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> ATSPushResponse:
    # Get org ATS config
    org = await _get_org(db, org_id)
    integrations = (org.settings or {}).get("ats_integrations", [])
    ats_config = next((i for i in integrations if i.get("platform") == req.platform), None)

    if not ats_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No {req.platform} integration configured",
        )

    # Merge request overrides into config
    merged_config = {**ats_config}
    if req.application_id:
        merged_config["application_id"] = req.application_id
    if req.opportunity_id:
        merged_config["opportunity_id"] = req.opportunity_id
    if req.candidate_id:
        merged_config["candidate_id"] = req.candidate_id
    if req.job_shortcode:
        merged_config["job_shortcode"] = req.job_shortcode

    # Get the report
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == req.session_id, InterviewSession.org_id == org_id
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")

    report_result = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == req.session_id)
    )
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not generated yet"
        )

    # Merge skill_scores and behavioral_scores for complete scorecard
    skill_scores = dict(report.skill_scores or {})
    for k, v in (report.behavioral_scores or {}).items():
        if isinstance(v, dict) and k not in skill_scores:
            skill_scores[k] = v

    # Build scorecard payload
    scorecard = {
        "candidate_name": session.candidate_name,
        "candidate_email": session.candidate_email,
        "overall_score": float(session.overall_score) if session.overall_score else 0,
        "skill_scores": skill_scores,
        "behavioral_scores": report.behavioral_scores or {},
        "summary": report.ai_summary or "",
        "ai_summary": report.ai_summary or "",
        "strengths": report.strengths or [],
        "concerns": report.concerns or [],
        "recommendation": report.recommendation or "",
    }

    result = await push_to_ats(req.platform, merged_config, scorecard)
    return ATSPushResponse(
        success=result["success"],
        platform=req.platform,
        error=result.get("error"),
    )


async def _get_org(db: AsyncSession, org_id: UUID) -> Organization:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org
