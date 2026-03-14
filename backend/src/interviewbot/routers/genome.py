"""Competency Genome API: candidate DNA fingerprints and role profiles."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.schemas import (
    CompetencyGenomeResponse,
    GenomeCompareRequest,
    GenomeMatchRequest,
    RoleGenomeProfileCreate,
    RoleGenomeProfileResponse,
)
from interviewbot.models.tables import (
    CandidateReport,
    CompetencyGenome,
    InterviewSession,
    JobPosting,
    RoleGenomeProfile,
)
from interviewbot.services.genome_engine import (
    compute_match_percentage,
    extract_genome_from_report,
    merge_genomes,
)

router = APIRouter(prefix="/genome", tags=["Genome"])


@router.get("/candidate/{email}", response_model=CompetencyGenomeResponse)
async def get_candidate_genome(
    email: str,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> CompetencyGenomeResponse:
    """Get a candidate's competency genome by email."""
    result = await db.execute(
        select(CompetencyGenome).where(
            CompetencyGenome.org_id == org_id,
            CompetencyGenome.candidate_email == email,
        )
    )
    genome = result.scalar_one_or_none()
    if not genome:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Genome not found for this candidate",
        )
    return CompetencyGenomeResponse.model_validate(genome)


@router.get("/candidates")
async def list_candidate_genomes(
    q: str | None = None,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """List all candidate genomes for the org, optionally filtered by search."""
    query = select(CompetencyGenome).where(CompetencyGenome.org_id == org_id)
    if q and q.strip():
        q_lower = q.strip().lower()
        query = query.where(
            or_(
                CompetencyGenome.candidate_email.ilike(f"%{q_lower}%"),
                CompetencyGenome.candidate_name.ilike(f"%{q_lower}%"),
            )
        )
    result = await db.execute(query.order_by(CompetencyGenome.updated_at.desc()))
    genomes = result.scalars().all()
    return {
        "items": [CompetencyGenomeResponse.model_validate(g) for g in genomes],
        "total": len(genomes),
    }


@router.post("/compare")
async def compare_genomes(
    body: GenomeCompareRequest,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Compare 2-5 candidate genomes side by side."""
    emails = body.candidate_emails or []
    if len(emails) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 2 candidate emails required",
        )
    if len(emails) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 5 candidates per comparison",
        )
    result = await db.execute(
        select(CompetencyGenome).where(
            CompetencyGenome.org_id == org_id,
            CompetencyGenome.candidate_email.in_(emails),
        )
    )
    genomes = {g.candidate_email: g for g in result.scalars().all()}
    missing = [e for e in emails if e not in genomes]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Genome not found for: {', '.join(missing)}",
        )
    return {
        "candidates": [
            {
                "email": e,
                "name": genomes[e].candidate_name,
                "genome_data": genomes[e].genome_data,
            }
            for e in emails
        ],
    }


@router.post("/match/{job_id}")
async def match_genome_to_job(
    job_id: UUID,
    body: GenomeMatchRequest,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Match a candidate's genome against the job's role profile."""
    job_result = await db.execute(
        select(JobPosting).where(
            JobPosting.id == job_id,
            JobPosting.org_id == org_id,
        )
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    profile_result = await db.execute(
        select(RoleGenomeProfile).where(
            RoleGenomeProfile.org_id == org_id,
            RoleGenomeProfile.role_type == job.role_type,
        )
    )
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No role profile for role type '{job.role_type}'",
        )
    genome_result = await db.execute(
        select(CompetencyGenome).where(
            CompetencyGenome.org_id == org_id,
            CompetencyGenome.candidate_email == body.candidate_email,
        )
    )
    genome = genome_result.scalar_one_or_none()
    if not genome:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Genome not found for this candidate",
        )
    match_result = compute_match_percentage(
        genome.genome_data or {},
        profile.ideal_genome or {},
    )
    return {
        "job_id": str(job_id),
        "job_title": job.title,
        "candidate_email": body.candidate_email,
        "role_profile": profile.title,
        **match_result,
    }


@router.get("/role-profiles")
async def list_role_profiles(
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """List all role genome profiles for the org."""
    result = await db.execute(
        select(RoleGenomeProfile).where(RoleGenomeProfile.org_id == org_id)
    )
    profiles = result.scalars().all()
    return {
        "items": [RoleGenomeProfileResponse.model_validate(p) for p in profiles],
    }


@router.post("/role-profiles", response_model=RoleGenomeProfileResponse)
async def create_role_profile(
    body: RoleGenomeProfileCreate,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> RoleGenomeProfileResponse:
    """Create a new role genome profile."""
    existing = await db.execute(
        select(RoleGenomeProfile).where(
            RoleGenomeProfile.org_id == org_id,
            RoleGenomeProfile.role_type == body.role_type,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Role profile already exists for '{body.role_type}'",
        )
    user_id = user.get("sub")
    profile = RoleGenomeProfile(
        org_id=org_id,
        role_type=body.role_type,
        title=body.title,
        ideal_genome=body.ideal_genome or {},
        created_by=UUID(user_id) if user_id else None,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return RoleGenomeProfileResponse.model_validate(profile)


@router.get("/role-profiles/{profile_id}", response_model=RoleGenomeProfileResponse)
async def get_role_profile(
    profile_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> RoleGenomeProfileResponse:
    """Get a single role profile by ID."""
    result = await db.execute(
        select(RoleGenomeProfile).where(
            RoleGenomeProfile.id == profile_id,
            RoleGenomeProfile.org_id == org_id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role profile not found",
        )
    return RoleGenomeProfileResponse.model_validate(profile)


@router.delete("/role-profiles/{profile_id}")
async def delete_role_profile(
    profile_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Delete a role profile."""
    result = await db.execute(
        select(RoleGenomeProfile).where(
            RoleGenomeProfile.id == profile_id,
            RoleGenomeProfile.org_id == org_id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role profile not found",
        )
    await db.delete(profile)
    await db.commit()
    return {"status": "deleted"}


@router.post("/rebuild/{email}", response_model=CompetencyGenomeResponse)
async def rebuild_genome(
    email: str,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> CompetencyGenomeResponse:
    """Force-rebuild genome from all completed interviews for this candidate."""
    sessions_result = await db.execute(
        select(InterviewSession)
        .where(
            InterviewSession.org_id == org_id,
            InterviewSession.candidate_email == email,
            InterviewSession.status == "completed",
        )
    )
    sessions = sessions_result.scalars().all()
    if not sessions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No completed interviews found for this candidate",
        )
    candidate_name = sessions[0].candidate_name or None
    merged_data: dict = {"dimensions": {}, "interview_count": 0}
    for session in sessions:
        report_result = await db.execute(
            select(CandidateReport).where(CandidateReport.session_id == session.id)
        )
        report = report_result.scalar_one_or_none()
        if not report:
            continue
        new_dims = await extract_genome_from_report(report)
        if new_dims:
            merged_data = merge_genomes(
                merged_data,
                new_dims,
                str(session.id),
            )
    existing = await db.execute(
        select(CompetencyGenome).where(
            CompetencyGenome.org_id == org_id,
            CompetencyGenome.candidate_email == email,
        )
    )
    genome = existing.scalar_one_or_none()
    if genome:
        genome.genome_data = merged_data
        genome.candidate_name = candidate_name or genome.candidate_name
        genome.version += 1
        await db.commit()
        await db.refresh(genome)
    else:
        genome = CompetencyGenome(
            org_id=org_id,
            candidate_email=email,
            candidate_name=candidate_name,
            genome_data=merged_data,
        )
        db.add(genome)
        await db.commit()
        await db.refresh(genome)
    return CompetencyGenomeResponse.model_validate(genome)
