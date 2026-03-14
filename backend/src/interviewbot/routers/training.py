"""Interviewer Training Simulator: practice interviewing with AI candidates."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import SimulationCreate, SimulationMessage
from interviewbot.models.tables import TrainingSimulation, User
from interviewbot.services.training_engine import (
    get_all_personas,
    get_random_persona,
    score_interviewer,
    simulate_candidate_response,
)

router = APIRouter(prefix="/training", tags=["Training"])


async def _get_simulation_with_org_check(
    db: AsyncSession, sim_id: UUID, org_id: UUID, user_id: UUID
) -> TrainingSimulation | None:
    result = await db.execute(
        select(TrainingSimulation).where(
            TrainingSimulation.id == sim_id,
            TrainingSimulation.org_id == org_id,
            TrainingSimulation.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


@router.post("/start")
async def start_simulation(
    body: SimulationCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    org_id: UUID = Depends(get_org_id),
):
    """Start a new training simulation."""
    user_id = UUID(str(user["sub"]))
    persona = body.persona.model_dump() if body.persona else get_random_persona()

    sim = TrainingSimulation(
        org_id=org_id,
        user_id=user_id,
        role_type=body.role_type,
        candidate_persona=persona,
        messages=[],
        status="active",
    )
    db.add(sim)
    await db.commit()
    await db.refresh(sim)
    return sim


@router.post("/{sim_id}/message")
async def send_message(
    sim_id: UUID,
    body: SimulationMessage,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    org_id: UUID = Depends(get_org_id),
):
    """Send interviewer message and get AI candidate response."""
    user_id = UUID(str(user["sub"]))
    sim = await _get_simulation_with_org_check(db, sim_id, org_id, user_id)
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    if sim.status != "active":
        raise HTTPException(status_code=400, detail="Simulation is not active")

    messages = list(sim.messages or [])
    messages.append({"role": "interviewer", "content": body.content})

    response = await simulate_candidate_response(
        sim.candidate_persona, messages, body.content
    )

    messages.append({"role": "candidate", "content": response})
    sim.messages = messages
    await db.commit()

    return {"response": response}


@router.post("/{sim_id}/end")
async def end_simulation(
    sim_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    org_id: UUID = Depends(get_org_id),
):
    """End simulation and generate scorecard."""
    user_id = UUID(str(user["sub"]))
    sim = await _get_simulation_with_org_check(db, sim_id, org_id, user_id)
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    if sim.status != "active":
        raise HTTPException(status_code=400, detail="Simulation is not active")

    scorecard = await score_interviewer(
        sim.role_type, sim.candidate_persona, sim.messages or []
    )

    sim.status = "completed"
    sim.scorecard = scorecard
    sim.completed_at = datetime.now(UTC)
    if sim.started_at:
        sim.duration_seconds = int(
            (sim.completed_at - sim.started_at).total_seconds()
        )
    await db.commit()
    await db.refresh(sim)

    return sim


@router.get("/history")
async def get_history(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
):
    """Get current user's training history ordered by date desc."""
    user_id = UUID(str(user["sub"]))
    result = await db.execute(
        select(TrainingSimulation)
        .where(TrainingSimulation.user_id == user_id)
        .order_by(TrainingSimulation.started_at.desc())
    )
    return result.scalars().all()


@router.get("/leaderboard")
async def get_leaderboard(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    org_id: UUID = Depends(get_org_id),
):
    """Get org users' average training scores."""
    result = await db.execute(
        select(TrainingSimulation)
        .where(
            TrainingSimulation.org_id == org_id,
            TrainingSimulation.status == "completed",
            TrainingSimulation.scorecard.isnot(None),
        )
    )
    sims = result.scalars().all()

    by_user: dict[UUID, list[float]] = {}
    for s in sims:
        sc = s.scorecard or {}
        overall = sc.get("overall")
        if overall is not None:
            try:
                score = float(overall)
            except (TypeError, ValueError):
                score = 0.0
        else:
            score = 0.0
        by_user.setdefault(s.user_id, []).append(score)

    user_ids = list(by_user.keys())
    if not user_ids:
        return []

    users_result = await db.execute(
        select(User.id, User.full_name, User.email).where(User.id.in_(user_ids))
    )
    users_map = {u.id: {"full_name": u.full_name, "email": u.email} for u in users_result}

    leaderboard = []
    for uid, scores in by_user.items():
        u = users_map.get(uid, {})
        leaderboard.append(
            {
                "user_id": str(uid),
                "full_name": u.get("full_name", "Unknown"),
                "email": u.get("email", ""),
                "avg_score": sum(scores) / len(scores) if scores else 0,
                "simulations_count": len(scores),
            }
        )

    leaderboard.sort(key=lambda x: x["avg_score"], reverse=True)
    return leaderboard


@router.get("/personas")
async def list_personas(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
):
    """List available candidate personas."""
    return get_all_personas()


@router.post("/personas/random")
async def get_random_persona_endpoint(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
):
    """Get a random persona."""
    return get_random_persona()


@router.get("/{sim_id}")
async def get_simulation(
    sim_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    org_id: UUID = Depends(get_org_id),
):
    """Get simulation with messages and scorecard."""
    user_id = UUID(str(user["sub"]))
    sim = await _get_simulation_with_org_check(db, sim_id, org_id, user_id)
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return sim
