"""Practice Mode - AI interview simulator with coaching."""

from __future__ import annotations

import secrets
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.config import get_settings
from interviewbot.dependencies import get_db
from interviewbot.models.tables import (
    InterviewSession,
    InterviewTemplate,
    JobPosting,
    Organization,
)

logger = structlog.get_logger()
router = APIRouter(prefix="/practice", tags=["Practice"])


class PracticeStartRequest(BaseModel):
    template_id: str | None = None
    role_type: str = Field("technical", pattern="^(technical|non_technical|mixed)$")
    candidate_name: str = Field("Practice User", min_length=1, max_length=255)


class PracticeStartResponse(BaseModel):
    token: str
    interview_url: str
    format: str
    role_type: str


@router.get("/templates")
async def get_practice_templates(db: AsyncSession = Depends(get_db)):
    """Get available practice templates (system templates only)."""
    result = await db.execute(
        select(InterviewTemplate).where(InterviewTemplate.is_system).limit(20)
    )
    templates = result.scalars().all()

    # If no system templates exist, return built-in options
    if not templates:
        return [
            {
                "id": "builtin-swe",
                "name": "Software Engineer",
                "role_type": "technical",
                "description": "Full-stack software engineering interview",
            },
            {
                "id": "builtin-pm",
                "name": "Product Manager",
                "role_type": "non_technical",
                "description": "Product management behavioral interview",
            },
            {
                "id": "builtin-ds",
                "name": "Data Scientist",
                "role_type": "technical",
                "description": "Data science and ML interview",
            },
            {
                "id": "builtin-fe",
                "name": "Frontend Developer",
                "role_type": "technical",
                "description": "React/TypeScript frontend interview",
            },
            {
                "id": "builtin-be",
                "name": "Backend Developer",
                "role_type": "technical",
                "description": "Python/Node.js backend interview",
            },
            {
                "id": "builtin-devops",
                "name": "DevOps Engineer",
                "role_type": "technical",
                "description": "Infrastructure and CI/CD interview",
            },
        ]

    return [
        {
            "id": str(t.id),
            "name": t.name,
            "role_type": t.role_type,
            "description": t.description or "",
        }
        for t in templates
    ]


@router.post("/start", response_model=PracticeStartResponse)
async def start_practice(
    body: PracticeStartRequest,
    db: AsyncSession = Depends(get_db),
):
    """Start a practice interview session. No auth required."""
    settings = get_settings()

    # Determine job details from template or defaults
    title = "Practice Interview"
    job_description = "This is a practice interview to help you prepare."
    required_skills = []
    config = {
        "num_questions": 5,
        "duration_minutes": 15,
        "difficulty": "medium",
        "include_coding": False,
    }
    interview_format = "text"
    role_type = body.role_type

    if body.template_id and not body.template_id.startswith("builtin-"):
        tmpl_result = await db.execute(
            select(InterviewTemplate).where(InterviewTemplate.id == body.template_id)
        )
        tmpl = tmpl_result.scalar_one_or_none()
        if tmpl:
            title = f"Practice: {tmpl.name}"
            job_description = tmpl.job_description_template or job_description
            required_skills = tmpl.required_skills or []
            config = {**config, **(tmpl.interview_config or {})}
            config["num_questions"] = min(config.get("num_questions", 5), 5)
            interview_format = tmpl.interview_format or "text"
    elif body.template_id:
        # Built-in templates
        builtin_configs = {
            "builtin-swe": {
                "title": "Practice: Software Engineer",
                "skills": ["Python", "System Design", "Algorithms"],
                "role_type": "technical",
            },
            "builtin-pm": {
                "title": "Practice: Product Manager",
                "skills": ["Product Strategy", "User Research", "Metrics"],
                "role_type": "non_technical",
            },
            "builtin-ds": {
                "title": "Practice: Data Scientist",
                "skills": ["Python", "Machine Learning", "Statistics"],
                "role_type": "technical",
            },
            "builtin-fe": {
                "title": "Practice: Frontend Developer",
                "skills": ["React", "TypeScript", "CSS"],
                "role_type": "technical",
            },
            "builtin-be": {
                "title": "Practice: Backend Developer",
                "skills": ["Python", "APIs", "Databases"],
                "role_type": "technical",
            },
            "builtin-devops": {
                "title": "Practice: DevOps Engineer",
                "skills": ["Docker", "CI/CD", "Cloud"],
                "role_type": "technical",
            },
        }
        bc = builtin_configs.get(body.template_id, {})
        title = bc.get("title", title)
        required_skills = bc.get("skills", [])
        role_type = bc.get("role_type", role_type)
        job_description = (
            f"Practice interview for {title.replace('Practice: ', '')} role "
            f"focusing on {', '.join(required_skills)}."
        )

    token = secrets.token_urlsafe(16)

    practice_org_id = UUID("00000000-0000-0000-0000-000000000001")

    org_result = await db.execute(select(Organization).where(Organization.id == practice_org_id))
    if not org_result.scalar_one_or_none():
        practice_org = Organization(id=practice_org_id, name="Practice Mode", is_active=True)
        db.add(practice_org)
        await db.flush()

    job = JobPosting(
        org_id=practice_org_id,
        title=title,
        role_type=role_type,
        job_description=job_description,
        required_skills=required_skills,
        interview_config=config,
        interview_format=interview_format,
        is_active=False,
    )
    db.add(job)
    await db.flush()

    session = InterviewSession(
        job_posting_id=job.id,
        org_id=practice_org_id,
        token=token,
        candidate_name=body.candidate_name,
        format=interview_format,
        is_practice=True,
    )
    db.add(session)
    await db.commit()

    return PracticeStartResponse(
        token=token,
        interview_url=f"{settings.app_url}/interview/{token}",
        format=interview_format,
        role_type=role_type,
    )
