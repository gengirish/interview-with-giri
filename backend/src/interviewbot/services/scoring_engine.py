"""AI Scoring Engine: analyzes interview transcripts and generates multi-dimensional scores."""

import json as json_mod

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.models.tables import CandidateReport, InterviewMessage, InterviewSession, JobPosting
from interviewbot.services.ai_engine import AIEngine, SCORING_PROMPT

logger = structlog.get_logger()


async def score_interview(session_id: str, db: AsyncSession) -> CandidateReport | None:
    """Score a completed interview session and persist the report."""
    session_result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        logger.error("score_session_not_found", session_id=session_id)
        return None

    job_result = await db.execute(
        select(JobPosting).where(JobPosting.id == session.job_posting_id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        logger.error("score_job_not_found", job_posting_id=str(session.job_posting_id))
        return None

    msg_result = await db.execute(
        select(InterviewMessage)
        .where(InterviewMessage.session_id == session_id)
        .order_by(InterviewMessage.created_at.asc())
    )
    messages = msg_result.scalars().all()
    if not messages:
        logger.warning("score_no_messages", session_id=session_id)
        return None

    transcript_lines = []
    for msg in messages:
        speaker = "Interviewer" if msg.role == "interviewer" else "Candidate"
        transcript_lines.append(f"{speaker}: {msg.content}")
    transcript = "\n\n".join(transcript_lines)

    skills = ", ".join(job.required_skills or [])
    prompt = SCORING_PROMPT.format(
        transcript=transcript[:8000],
        job_title=job.title,
        required_skills=skills,
    )

    engine = AIEngine()
    raw_response = await engine.chat(
        [{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    try:
        cleaned = raw_response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        scores = json_mod.loads(cleaned)
    except json_mod.JSONDecodeError:
        logger.error("score_parse_failed", raw=raw_response[:200])
        scores = {
            "skill_scores": {},
            "behavioral_scores": {},
            "overall_score": 5.0,
            "confidence_score": 0.3,
            "summary": "Unable to parse scoring response.",
            "strengths": [],
            "concerns": ["Scoring analysis encountered an error."],
            "recommendation": "No Hire",
        }

    overall = float(scores.get("overall_score", 5.0))
    session.overall_score = overall
    await db.commit()

    existing = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == session_id)
    )
    if existing.scalar_one_or_none():
        logger.info("score_report_exists", session_id=session_id)
        return existing.scalar_one_or_none()

    report = CandidateReport(
        session_id=session.id,
        skill_scores=scores.get("skill_scores", {}),
        behavioral_scores=scores.get("behavioral_scores", {}),
        ai_summary=scores.get("summary", ""),
        strengths=scores.get("strengths", []),
        concerns=scores.get("concerns", []),
        recommendation=_normalize_recommendation(scores.get("recommendation", "")),
        confidence_score=float(scores.get("confidence_score", 0.5)),
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    logger.info(
        "interview_scored",
        session_id=session_id,
        overall_score=overall,
        recommendation=report.recommendation,
    )
    return report


def _normalize_recommendation(raw: str) -> str:
    raw_lower = raw.lower().replace(" ", "_")
    if "strong_hire" in raw_lower or "stronghire" in raw_lower:
        return "strong_hire"
    if "no_hire" in raw_lower or "nohire" in raw_lower:
        return "no_hire"
    if "hire" in raw_lower:
        return "hire"
    return "no_hire"
