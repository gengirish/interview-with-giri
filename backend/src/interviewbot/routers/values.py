"""Cultural Fit & Values Assessment router."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.tables import (
    CompanyValues,
    InterviewMessage,
    InterviewSession,
    ValuesAssessment,
)
from interviewbot.services.values_engine import assess_values, generate_value_questions

router = APIRouter(prefix="/values", tags=["Values"])


@router.get("")
async def get_company_values(
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    result = await db.execute(
        select(CompanyValues).where(CompanyValues.org_id == org_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        return {"id": None, "org_id": str(org_id), "values": [], "updated_at": None}
    return entry


@router.put("")
async def update_company_values(
    data: dict,
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
    _user=Depends(require_role(["admin"])),
):
    result = await db.execute(
        select(CompanyValues).where(CompanyValues.org_id == org_id)
    )
    entry = result.scalar_one_or_none()
    values_list = data.get("values", [])
    if entry:
        entry.values = values_list
    else:
        entry = CompanyValues(org_id=org_id, values=values_list)
        db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.post("/generate-questions")
async def generate_questions(
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    result = await db.execute(
        select(CompanyValues).where(CompanyValues.org_id == org_id)
    )
    entry = result.scalar_one_or_none()
    if not entry or not entry.values:
        raise HTTPException(status_code=404, detail="No company values defined")
    questions = await generate_value_questions(entry.values)
    return {"questions": questions}


@router.post("/assess/{session_id}")
async def run_assessment(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    result = await db.execute(
        select(CompanyValues).where(CompanyValues.org_id == org_id)
    )
    cv = result.scalar_one_or_none()
    if not cv or not cv.values:
        raise HTTPException(status_code=404, detail="No company values defined")

    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")

    result = await db.execute(
        select(InterviewMessage)
        .where(InterviewMessage.session_id == session_id)
        .order_by(InterviewMessage.created_at)
    )
    messages = result.scalars().all()
    transcript = "\n".join(f"{m.role}: {m.content}" for m in messages)

    assessment_data = await assess_values(cv.values, transcript)

    result = await db.execute(
        select(ValuesAssessment).where(ValuesAssessment.session_id == session_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.value_scores = assessment_data.get("value_scores", {})
        existing.overall_fit_score = assessment_data.get("overall_fit_score")
        existing.fit_label = assessment_data.get("fit_label")
        existing.ai_narrative = assessment_data.get("narrative")
    else:
        existing = ValuesAssessment(
            session_id=session_id,
            org_id=org_id,
            value_scores=assessment_data.get("value_scores", {}),
            overall_fit_score=assessment_data.get("overall_fit_score"),
            fit_label=assessment_data.get("fit_label"),
            ai_narrative=assessment_data.get("narrative"),
        )
        db.add(existing)
    await db.commit()
    await db.refresh(existing)
    return existing


@router.get("/assessment/{session_id}")
async def get_assessment(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    result = await db.execute(
        select(ValuesAssessment).where(
            ValuesAssessment.session_id == session_id,
            ValuesAssessment.org_id == org_id,
        )
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="No assessment found")
    return assessment


@router.get("/org-trends")
async def get_org_trends(
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    result = await db.execute(
        select(ValuesAssessment).where(ValuesAssessment.org_id == org_id)
    )
    assessments = result.scalars().all()
    if not assessments:
        return {"count": 0, "avg_fit_score": None, "value_averages": {}}

    scores = [float(a.overall_fit_score) for a in assessments if a.overall_fit_score]
    avg_fit = round(sum(scores) / len(scores), 2) if scores else None

    value_totals: dict[str, list[float]] = {}
    for a in assessments:
        for val_name, val_data in (a.value_scores or {}).items():
            if isinstance(val_data, dict) and "score" in val_data:
                value_totals.setdefault(val_name, []).append(val_data["score"])

    value_averages = {
        k: round(sum(v) / len(v), 2) for k, v in value_totals.items() if v
    }

    return {
        "count": len(assessments),
        "avg_fit_score": avg_fit,
        "value_averages": value_averages,
    }
