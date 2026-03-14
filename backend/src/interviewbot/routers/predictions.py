"""Predictions API: hiring outcomes and success prediction."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import (
    HiringOutcomeCreate,
    HiringOutcomeResponse,
    HiringOutcomeUpdate,
    PredictionModelResponse,
    PredictionResponse,
)
from interviewbot.models.tables import (
    CandidateReport,
    HiringOutcome,
    InterviewSession,
    PredictionModel,
)
from interviewbot.services.prediction_engine import (
    apply_model,
    extract_features,
    heuristic_prediction,
    train_model,
)

router = APIRouter(prefix="/predictions", tags=["Predictions"])


@router.post("/outcomes", response_model=HiringOutcomeResponse)
async def record_outcome(
    body: HiringOutcomeCreate,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> HiringOutcomeResponse:
    """Record a hiring outcome for a candidate."""
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == body.session_id,
            InterviewSession.org_id == org_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    existing = await db.execute(
        select(HiringOutcome).where(HiringOutcome.session_id == body.session_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Outcome already recorded for this session",
        )

    outcome = HiringOutcome(
        org_id=org_id,
        session_id=body.session_id,
        candidate_email=body.candidate_email,
        was_hired=body.was_hired,
        hire_date=body.hire_date,
    )
    db.add(outcome)
    await db.commit()
    await db.refresh(outcome)
    return HiringOutcomeResponse.model_validate(outcome)


@router.put("/outcomes/{session_id}", response_model=HiringOutcomeResponse)
async def update_outcome(
    session_id: UUID,
    body: HiringOutcomeUpdate,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> HiringOutcomeResponse:
    """Update post-hire feedback for an outcome."""
    result = await db.execute(
        select(HiringOutcome).where(
            HiringOutcome.session_id == session_id,
            HiringOutcome.org_id == org_id,
        )
    )
    outcome = result.scalar_one_or_none()
    if not outcome:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Outcome not found",
        )

    if body.performance_rating is not None:
        outcome.performance_rating = body.performance_rating
    if body.retention_months is not None:
        outcome.retention_months = body.retention_months
    if body.is_still_employed is not None:
        outcome.is_still_employed = body.is_still_employed
    if body.left_reason is not None:
        outcome.left_reason = body.left_reason
    if body.manager_feedback is not None:
        outcome.manager_feedback = body.manager_feedback

    await db.commit()
    await db.refresh(outcome)
    return HiringOutcomeResponse.model_validate(outcome)


@router.get("/outcomes/by-session/{session_id}", response_model=HiringOutcomeResponse)
async def get_outcome_by_session(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Get hiring outcome for a session, if any."""
    result = await db.execute(
        select(HiringOutcome).where(
            HiringOutcome.session_id == session_id,
            HiringOutcome.org_id == org_id,
        )
    )
    outcome = result.scalar_one_or_none()
    if not outcome:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No outcome recorded for this session",
        )
    return HiringOutcomeResponse.model_validate(outcome)


@router.get("/outcomes")
async def list_outcomes(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """List hiring outcomes for the org."""
    count_stmt = select(HiringOutcome).where(HiringOutcome.org_id == org_id)
    total_result = await db.execute(count_stmt)
    total = len(total_result.scalars().all())

    result = await db.execute(
        select(HiringOutcome)
        .where(HiringOutcome.org_id == org_id)
        .order_by(HiringOutcome.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    outcomes = result.scalars().all()
    return {
        "items": [HiringOutcomeResponse.model_validate(o) for o in outcomes],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.post("/train")
async def train_prediction_model(
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Train the prediction model from outcomes with performance data."""
    result = await db.execute(
        select(HiringOutcome)
        .where(
            HiringOutcome.org_id == org_id,
            HiringOutcome.was_hired == True,
            HiringOutcome.performance_rating.isnot(None),
        )
    )
    outcomes = result.scalars().all()

    outcomes_with_features: list[dict] = []
    for o in outcomes:
        report_result = await db.execute(
            select(CandidateReport).where(CandidateReport.session_id == o.session_id)
        )
        report = report_result.scalar_one_or_none()
        if not report:
            continue

        session_result = await db.execute(
            select(InterviewSession).where(InterviewSession.id == o.session_id)
        )
        session = session_result.scalar_one_or_none()
        overall = float(session.overall_score) if session and session.overall_score else 0.0

        features = extract_features(
            report,
            engagement_profile=report.engagement_profile,
            overall_score=overall,
        )
        perf = float(o.performance_rating or 0)
        retention = o.retention_months or 0
        success = perf >= 3.5 and retention >= 6
        outcomes_with_features.append({"features": features, "success": success})

    trained = train_model(outcomes_with_features)
    if "error" in trained:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=trained["error"],
        )

    max_version_result = await db.execute(
        select(PredictionModel)
        .where(PredictionModel.org_id == org_id)
        .order_by(PredictionModel.model_version.desc())
        .limit(1)
    )
    prev = max_version_result.scalar_one_or_none()
    next_version = (prev.model_version + 1) if prev else 1

    all_models_result = await db.execute(
        select(PredictionModel).where(PredictionModel.org_id == org_id)
    )
    for m in all_models_result.scalars().all():
        m.is_active = False
    await db.commit()

    model = PredictionModel(
        org_id=org_id,
        model_version=next_version,
        training_sample_size=trained["training_sample_size"],
        feature_weights=trained["feature_weights"],
        accuracy_metrics=trained["accuracy_metrics"],
        is_active=True,
    )
    db.add(model)
    await db.commit()
    await db.refresh(model)
    return PredictionModelResponse.model_validate(model)


@router.get("/status")
async def get_prediction_status(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Get prediction status: model info or trainable outcomes count."""
    model_result = await db.execute(
        select(PredictionModel).where(
            PredictionModel.org_id == org_id,
            PredictionModel.is_active == True,
        )
    )
    model = model_result.scalar_one_or_none()

    trainable_result = await db.execute(
        select(HiringOutcome).where(
            HiringOutcome.org_id == org_id,
            HiringOutcome.was_hired == True,
            HiringOutcome.performance_rating.isnot(None),
        )
    )
    trainable_count = len(trainable_result.scalars().all())

    if model:
        return {
            "model": PredictionModelResponse.model_validate(model),
            "trainable_outcomes": trainable_count,
            "outcomes_needed": 10,
        }
    return {
        "model": None,
        "trainable_outcomes": trainable_count,
        "outcomes_needed": 10,
    }


@router.get("/model", response_model=PredictionModelResponse | None)
async def get_model(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Get the current active prediction model."""
    result = await db.execute(
        select(PredictionModel).where(
            PredictionModel.org_id == org_id,
            PredictionModel.is_active == True,
        )
    )
    model = result.scalar_one_or_none()
    if not model:
        return None
    return PredictionModelResponse.model_validate(model)


@router.get("/predict/{session_id}", response_model=PredictionResponse)
async def get_prediction(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> PredictionResponse:
    """Get success prediction for a candidate."""
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    report_result = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == session_id)
    )
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not generated yet",
        )

    overall = float(session.overall_score) if session.overall_score else 0.0
    features = extract_features(
        report,
        engagement_profile=report.engagement_profile,
        overall_score=overall,
    )

    model_result = await db.execute(
        select(PredictionModel).where(
            PredictionModel.org_id == org_id,
            PredictionModel.is_active == True,
        )
    )
    model = model_result.scalar_one_or_none()

    if model and model.feature_weights:
        pred = apply_model(features, model.feature_weights)
    else:
        pred = heuristic_prediction(features)

    return PredictionResponse(**pred)


@router.get("/insights")
async def get_insights(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Get which signals matter most (feature importance)."""
    result = await db.execute(
        select(PredictionModel).where(
            PredictionModel.org_id == org_id,
            PredictionModel.is_active == True,
        )
    )
    model = result.scalar_one_or_none()
    if not model or not model.feature_weights:
        return {"feature_importance": [], "message": "No trained model yet"}

    items = [
        {
            "factor": k.replace("_", " ").title(),
            "weight": v,
            "impact": "positive" if v > 0 else "negative",
        }
        for k, v in sorted(model.feature_weights.items(), key=lambda x: -abs(x[1]))
    ]
    return {"feature_importance": items}
