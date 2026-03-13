"""Interview template management - system + org-level templates."""
# ruff: noqa: E501

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.dependencies import get_current_user, get_db, get_org_id, require_role
from interviewbot.models.tables import InterviewTemplate, JobPosting

logger = structlog.get_logger()
router = APIRouter(prefix="/templates", tags=["Templates"])

SYSTEM_TEMPLATES = [
    {
        "name": "Senior React Developer",
        "description": "Full-stack React interview covering hooks, state management, performance, and system design",
        "role_type": "technical",
        "required_skills": [
            "React",
            "TypeScript",
            "JavaScript",
            "CSS",
            "REST APIs",
            "State Management",
        ],
        "interview_config": {
            "num_questions": 10,
            "duration_minutes": 45,
            "difficulty": "hard",
            "include_coding": True,
            "language": "en",
        },
        "interview_format": "text",
        "job_description_template": "We are looking for a Senior React Developer with 5+ years of experience building complex, performant web applications. The ideal candidate has deep expertise in React hooks, component architecture, state management (Redux/Zustand), and TypeScript. Experience with testing (Jest, React Testing Library) and CI/CD is required.",
    },
    {
        "name": "Backend Python Engineer",
        "description": "Python backend interview covering FastAPI, databases, system design, and testing",
        "role_type": "technical",
        "required_skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "REST APIs", "Testing"],
        "interview_config": {
            "num_questions": 10,
            "duration_minutes": 45,
            "difficulty": "medium",
            "include_coding": True,
            "language": "en",
        },
        "interview_format": "text",
        "job_description_template": "We are seeking a Backend Python Engineer proficient in FastAPI, SQLAlchemy, and PostgreSQL. The role involves designing and building scalable APIs, writing comprehensive tests, and deploying via Docker. Experience with async programming and message queues is a plus.",
    },
    {
        "name": "Product Manager",
        "description": "Behavioral and product sense interview for product managers",
        "role_type": "non_technical",
        "required_skills": [
            "Product Strategy",
            "User Research",
            "Roadmapping",
            "Stakeholder Management",
            "Data Analysis",
        ],
        "interview_config": {
            "num_questions": 8,
            "duration_minutes": 30,
            "difficulty": "medium",
            "include_coding": False,
            "language": "en",
        },
        "interview_format": "text",
        "job_description_template": "We are hiring a Product Manager to own the product roadmap, conduct user research, and collaborate cross-functionally. The ideal candidate has 3+ years of PM experience, strong analytical skills, and excellent communication.",
    },
    {
        "name": "DevOps / SRE Engineer",
        "description": "Infrastructure, CI/CD, monitoring, and incident response interview",
        "role_type": "technical",
        "required_skills": ["Docker", "Kubernetes", "CI/CD", "AWS/GCP", "Terraform", "Monitoring"],
        "interview_config": {
            "num_questions": 10,
            "duration_minutes": 45,
            "difficulty": "hard",
            "include_coding": False,
            "language": "en",
        },
        "interview_format": "voice",
        "job_description_template": "We need a DevOps/SRE Engineer to build and maintain our cloud infrastructure. Responsibilities include CI/CD pipelines, container orchestration (Kubernetes), infrastructure as code (Terraform), and production monitoring/alerting. On-call rotation required.",
    },
    {
        "name": "Data Scientist",
        "description": "ML, statistics, and data analysis interview with coding component",
        "role_type": "technical",
        "required_skills": [
            "Python",
            "Machine Learning",
            "Statistics",
            "SQL",
            "Pandas",
            "Scikit-learn",
        ],
        "interview_config": {
            "num_questions": 8,
            "duration_minutes": 40,
            "difficulty": "hard",
            "include_coding": True,
            "language": "en",
        },
        "interview_format": "text",
        "job_description_template": "We are looking for a Data Scientist to build ML models, analyze large datasets, and derive business insights. Proficiency in Python (pandas, scikit-learn, PyTorch), SQL, and statistical methods required. Experience with A/B testing and experiment design is a plus.",
    },
    {
        "name": "Sales Executive",
        "description": "Behavioral interview for B2B sales covering pipeline, negotiation, and relationship building",
        "role_type": "non_technical",
        "required_skills": [
            "B2B Sales",
            "Pipeline Management",
            "Negotiation",
            "CRM",
            "Relationship Building",
        ],
        "interview_config": {
            "num_questions": 8,
            "duration_minutes": 25,
            "difficulty": "medium",
            "include_coding": False,
            "language": "en",
        },
        "interview_format": "voice",
        "job_description_template": "We are hiring a Sales Executive to drive B2B revenue. Responsibilities include building pipeline, conducting demos, negotiating contracts, and managing CRM. 3+ years of SaaS sales experience with a proven track record of hitting quota required.",
    },
    {
        "name": "QA / Test Engineer",
        "description": "Testing strategy, automation, and quality processes interview",
        "role_type": "mixed",
        "required_skills": [
            "Test Automation",
            "Selenium",
            "Playwright",
            "API Testing",
            "CI/CD",
            "Test Strategy",
        ],
        "interview_config": {
            "num_questions": 8,
            "duration_minutes": 35,
            "difficulty": "medium",
            "include_coding": True,
            "language": "en",
        },
        "interview_format": "text",
        "job_description_template": "We need a QA Engineer to design test strategies, build automation frameworks, and ensure product quality. Experience with Playwright/Selenium, API testing, and CI/CD integration required. Knowledge of performance testing is a bonus.",
    },
    {
        "name": "UX Designer",
        "description": "Design thinking, user research, prototyping, and portfolio review",
        "role_type": "non_technical",
        "required_skills": [
            "UI/UX Design",
            "Figma",
            "User Research",
            "Prototyping",
            "Design Systems",
            "Accessibility",
        ],
        "interview_config": {
            "num_questions": 8,
            "duration_minutes": 30,
            "difficulty": "medium",
            "include_coding": False,
            "language": "en",
        },
        "interview_format": "video",
        "job_description_template": "We are looking for a UX Designer to create intuitive, accessible user experiences. The role involves user research, wireframing, prototyping in Figma, and contributing to our design system. A strong portfolio demonstrating end-to-end design process is required.",
    },
    {
        "name": "Full-Stack Engineer",
        "description": "End-to-end web development covering frontend, backend, and system design",
        "role_type": "technical",
        "required_skills": [
            "React",
            "Node.js",
            "TypeScript",
            "PostgreSQL",
            "REST APIs",
            "System Design",
        ],
        "interview_config": {
            "num_questions": 12,
            "duration_minutes": 50,
            "difficulty": "hard",
            "include_coding": True,
            "language": "en",
        },
        "interview_format": "text",
        "job_description_template": "We are hiring a Full-Stack Engineer to build end-to-end features. The ideal candidate is proficient in React, Node.js/Python, TypeScript, and PostgreSQL. Experience with cloud services (AWS/GCP), CI/CD, and agile development required.",
    },
    {
        "name": "Mobile Developer (React Native)",
        "description": "React Native mobile development interview with coding exercises",
        "role_type": "technical",
        "required_skills": [
            "React Native",
            "TypeScript",
            "iOS",
            "Android",
            "REST APIs",
            "Mobile UI",
        ],
        "interview_config": {
            "num_questions": 8,
            "duration_minutes": 40,
            "difficulty": "medium",
            "include_coding": True,
            "language": "en",
        },
        "interview_format": "text",
        "job_description_template": "We need a Mobile Developer experienced in React Native to build cross-platform mobile applications. Strong knowledge of TypeScript, mobile UI patterns, native modules, and app store deployment required. Experience with Expo and mobile testing frameworks is a plus.",
    },
    {
        "name": "Customer Success Manager",
        "description": "Account management, retention, and client relationship interview",
        "role_type": "non_technical",
        "required_skills": [
            "Account Management",
            "Client Relations",
            "Onboarding",
            "Retention",
            "Communication",
        ],
        "interview_config": {
            "num_questions": 8,
            "duration_minutes": 25,
            "difficulty": "medium",
            "include_coding": False,
            "language": "en",
        },
        "interview_format": "voice",
        "job_description_template": "We are looking for a Customer Success Manager to onboard clients, drive adoption, and reduce churn. The ideal candidate has 2+ years of CSM experience in SaaS, excellent communication skills, and a track record of managing a portfolio of accounts.",
    },
    {
        "name": "Engineering Manager",
        "description": "Leadership, team building, technical strategy, and process management",
        "role_type": "mixed",
        "required_skills": [
            "Team Leadership",
            "Technical Strategy",
            "Agile",
            "Hiring",
            "Performance Management",
            "System Design",
        ],
        "interview_config": {
            "num_questions": 10,
            "duration_minutes": 45,
            "difficulty": "hard",
            "include_coding": False,
            "language": "en",
        },
        "interview_format": "video",
        "job_description_template": "We are hiring an Engineering Manager to lead a team of 6-10 engineers. Responsibilities include hiring, mentoring, sprint planning, technical roadmap ownership, and cross-functional collaboration. 2+ years of management experience and strong technical background required.",
    },
    {
        "name": "Junior Developer (Entry Level)",
        "description": "Fundamentals-focused interview for new graduates and junior developers",
        "role_type": "technical",
        "required_skills": [
            "Programming Fundamentals",
            "Data Structures",
            "Problem Solving",
            "Git",
            "Web Basics",
        ],
        "interview_config": {
            "num_questions": 8,
            "duration_minutes": 30,
            "difficulty": "easy",
            "include_coding": True,
            "language": "en",
        },
        "interview_format": "text",
        "job_description_template": "We are looking for a Junior Developer eager to learn and grow. Candidates should have a CS degree or equivalent bootcamp training, familiarity with at least one programming language (Python, JavaScript, or Java), basic understanding of data structures, and experience with Git.",
    },
    {
        "name": "Security Engineer",
        "description": "Application security, threat modeling, and security architecture interview",
        "role_type": "technical",
        "required_skills": [
            "Application Security",
            "Penetration Testing",
            "OWASP",
            "Security Architecture",
            "Incident Response",
        ],
        "interview_config": {
            "num_questions": 10,
            "duration_minutes": 45,
            "difficulty": "hard",
            "include_coding": False,
            "language": "en",
        },
        "interview_format": "text",
        "job_description_template": "We need a Security Engineer to lead our application security program. Responsibilities include threat modeling, security code review, penetration testing, and incident response. CISSP/CEH certification preferred. Deep knowledge of OWASP Top 10 and secure development practices required.",
    },
    {
        "name": "Marketing Manager",
        "description": "Digital marketing strategy, campaign management, and analytics interview",
        "role_type": "non_technical",
        "required_skills": [
            "Digital Marketing",
            "SEO/SEM",
            "Content Strategy",
            "Analytics",
            "Campaign Management",
        ],
        "interview_config": {
            "num_questions": 8,
            "duration_minutes": 25,
            "difficulty": "medium",
            "include_coding": False,
            "language": "en",
        },
        "interview_format": "voice",
        "job_description_template": "We are hiring a Marketing Manager to drive growth through digital channels. Experience with SEO/SEM, content marketing, paid advertising, and marketing analytics required. Strong storytelling skills and data-driven mindset essential.",
    },
]


@router.get("")
async def list_templates(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[dict]:
    """Return system templates + org-specific templates."""
    result = await db.execute(
        select(InterviewTemplate)
        .where(
            or_(
                InterviewTemplate.is_system.is_(True),
                InterviewTemplate.org_id == org_id,
            )
        )
        .order_by(InterviewTemplate.is_system.desc(), InterviewTemplate.name)
    )
    templates = result.scalars().all()

    if not templates:
        # Seed system templates on first access
        for tmpl_data in SYSTEM_TEMPLATES:
            tmpl = InterviewTemplate(
                org_id=None,
                name=tmpl_data["name"],
                description=tmpl_data["description"],
                role_type=tmpl_data["role_type"],
                job_description_template=tmpl_data["job_description_template"],
                required_skills=tmpl_data["required_skills"],
                interview_config=tmpl_data["interview_config"],
                interview_format=tmpl_data["interview_format"],
                is_system=True,
            )
            db.add(tmpl)
        await db.commit()

        # Re-query
        result = await db.execute(
            select(InterviewTemplate)
            .where(InterviewTemplate.is_system.is_(True))
            .order_by(InterviewTemplate.name)
        )
        templates = result.scalars().all()

    return [_template_to_dict(t) for t in templates]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_template(
    data: dict = Body(...),
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    """Create a custom org template."""
    tmpl = InterviewTemplate(
        org_id=org_id,
        name=data.get("name", "Custom Template"),
        description=data.get("description", ""),
        role_type=data.get("role_type", "mixed"),
        job_description_template=data.get("job_description_template", ""),
        required_skills=data.get("required_skills", []),
        interview_config=data.get("interview_config", {}),
        interview_format=data.get("interview_format", "text"),
        is_system=False,
    )
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return _template_to_dict(tmpl)


@router.post("/from-job/{job_id}", status_code=status.HTTP_201_CREATED)
async def create_template_from_job(
    job_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> dict:
    """Save an existing job posting as a reusable template."""
    job_result = await db.execute(
        select(JobPosting).where(JobPosting.id == job_id, JobPosting.org_id == org_id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job posting not found")

    tmpl = InterviewTemplate(
        org_id=org_id,
        name=f"{job.title} Template",
        description=f"Template created from job posting: {job.title}",
        role_type=job.role_type,
        job_description_template=job.job_description,
        required_skills=job.required_skills or [],
        interview_config=job.interview_config or {},
        interview_format=job.interview_format,
        is_system=False,
    )
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return _template_to_dict(tmpl)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: UUID,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> None:
    """Delete an org template (system templates cannot be deleted)."""
    result = await db.execute(
        select(InterviewTemplate).where(
            InterviewTemplate.id == template_id,
            InterviewTemplate.org_id == org_id,
            InterviewTemplate.is_system.is_(False),
        )
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Template not found or is a system template"
        )
    await db.delete(tmpl)
    await db.commit()


def _template_to_dict(t: InterviewTemplate) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "description": t.description,
        "role_type": t.role_type,
        "job_description_template": t.job_description_template,
        "required_skills": t.required_skills or [],
        "interview_config": t.interview_config or {},
        "interview_format": t.interview_format,
        "is_system": t.is_system,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }
