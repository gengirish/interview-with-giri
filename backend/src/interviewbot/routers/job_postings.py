import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_current_user, get_db, get_org_id
from interviewbot.models.schemas import (
    JobPostingCreateRequest,
    JobPostingResponse,
    JobPostingUpdateRequest,
    PaginatedResponse,
)
from interviewbot.models.tables import InterviewSession, JobPosting

router = APIRouter(prefix="/job-postings", tags=["Job Postings"])


@router.post("", response_model=JobPostingResponse, status_code=status.HTTP_201_CREATED)
async def create_job_posting(
    req: JobPostingCreateRequest,
    user: dict = Depends(get_current_user),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> JobPostingResponse:
    posting = JobPosting(
        org_id=org_id,
        title=req.title,
        role_type=req.role_type.value,
        job_description=req.job_description,
        required_skills=req.required_skills,
        interview_format=req.interview_format.value,
        interview_config=req.interview_config.model_dump(),
    )
    db.add(posting)
    await db.commit()
    await db.refresh(posting)

    return _to_response(posting)


@router.get("", response_model=PaginatedResponse)
async def list_job_postings(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> PaginatedResponse:
    base_query = select(JobPosting).where(JobPosting.org_id == org_id)

    count_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total = count_result.scalar() or 0

    result = await db.execute(
        base_query.order_by(JobPosting.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    postings = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(p) for p in postings],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{posting_id}", response_model=JobPostingResponse)
async def get_job_posting(
    posting_id: UUID,
    user: dict = Depends(get_current_user),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> JobPostingResponse:
    posting = await _get_posting_or_404(db, org_id, posting_id)
    return _to_response(posting)


@router.patch("/{posting_id}", response_model=JobPostingResponse)
async def update_job_posting(
    posting_id: UUID,
    req: JobPostingUpdateRequest,
    user: dict = Depends(get_current_user),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> JobPostingResponse:
    posting = await _get_posting_or_404(db, org_id, posting_id)

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "interview_config" and value is not None:
            value = value.model_dump() if hasattr(value, "model_dump") else value
        if field == "interview_format" and value is not None:
            value = value.value if hasattr(value, "value") else value
        setattr(posting, field, value)

    await db.commit()
    await db.refresh(posting)
    return _to_response(posting)


@router.delete("/{posting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job_posting(
    posting_id: UUID,
    user: dict = Depends(get_current_user),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> None:
    posting = await _get_posting_or_404(db, org_id, posting_id)
    await db.delete(posting)
    await db.commit()


@router.post("/{posting_id}/generate-link", response_model=dict)
async def generate_interview_link(
    posting_id: UUID,
    user: dict = Depends(get_current_user),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict[str, str]:
    await _get_posting_or_404(db, org_id, posting_id)

    token = secrets.token_urlsafe(32)
    session = InterviewSession(
        job_posting_id=posting_id,
        org_id=org_id,
        token=token,
    )
    db.add(session)
    await db.commit()

    return {"token": token, "interview_url": f"/interview/{token}"}


@router.post("/{posting_id}/extract-skills", response_model=dict)
async def extract_skills(
    posting_id: UUID,
    user: dict = Depends(get_current_user),  # noqa: B006
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    posting = await _get_posting_or_404(db, org_id, posting_id)

    from interviewbot.services.ai_engine import AIEngine, SKILL_EXTRACTION_PROMPT

    engine = AIEngine()
    prompt = SKILL_EXTRACTION_PROMPT.format(job_description=posting.job_description[:3000])

    import json as json_mod

    raw = await engine.chat([{"role": "user", "content": prompt}], temperature=0.3)

    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        result = json_mod.loads(cleaned)
    except json_mod.JSONDecodeError:
        result = {"technical_skills": [], "soft_skills": [], "error": "Failed to parse AI response"}

    all_skills = result.get("technical_skills", []) + result.get("soft_skills", [])
    if all_skills:
        posting.required_skills = all_skills
        await db.commit()

    return result


async def _get_posting_or_404(
    db: AsyncSession, org_id: UUID, posting_id: UUID
) -> JobPosting:
    result = await db.execute(
        select(JobPosting).where(
            JobPosting.id == posting_id,
            JobPosting.org_id == org_id,
        )
    )
    posting = result.scalar_one_or_none()
    if not posting:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job posting not found")
    return posting


def _to_response(posting: JobPosting) -> JobPostingResponse:
    return JobPostingResponse(
        id=posting.id,
        org_id=posting.org_id,
        title=posting.title,
        role_type=posting.role_type,
        job_description=posting.job_description,
        required_skills=posting.required_skills or [],
        interview_format=posting.interview_format,
        interview_config=posting.interview_config or {},
        is_active=posting.is_active,
        created_at=posting.created_at,
    )
