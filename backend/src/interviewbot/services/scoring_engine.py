"""AI Scoring Engine: analyzes interview transcripts and generates multi-dimensional scores."""

from __future__ import annotations

import json as json_mod

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.models.tables import (
    CandidateReport,
    InterviewMessage,
    InterviewSession,
    JobPosting,
)
from interviewbot.services.ai_engine import GENERAL_SCORING_PROMPT, SWE_SCORING_PROMPT, AIEngine

logger = structlog.get_logger()

# Role types that use SWE-specific dimensional scoring
_SWE_ROLE_TYPES = ("technical", "mixed")
_MAX_SCORING_RETRIES = 2


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

    transcript = _build_transcript(messages)
    skills = ", ".join(job.required_skills or [])
    is_swe = (job.role_type or "").lower() in _SWE_ROLE_TYPES

    if is_swe:
        config = job.interview_config or {}
        experience_level = config.get("experience_level", "mid")
        prompt = SWE_SCORING_PROMPT.format(
            transcript=transcript[:8000],
            job_title=job.title,
            required_skills=skills,
            experience_level=experience_level,
        )
    else:
        prompt = GENERAL_SCORING_PROMPT.format(
            transcript=transcript[:8000],
            job_title=job.title,
            required_skills=skills,
        )

    engine = AIEngine()
    scores: dict = {}
    for attempt in range(_MAX_SCORING_RETRIES + 1):
        raw_response = await engine.chat(
            [{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        scores = _parse_score_response(raw_response, is_swe)
        if scores.get("summary") != "Unable to parse scoring response.":
            break
        logger.warning("score_parse_retry_full", attempt=attempt + 1, session_id=session_id)

    overall = float(scores.get("overall_score", 5.0))
    session.overall_score = overall
    await db.commit()

    existing = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == session_id)
    )
    if existing.scalar_one_or_none():
        logger.info("score_report_exists", session_id=session_id)
        return existing.scalar_one_or_none()

    skill_scores, behavioral_scores, extended_data = _extract_report_data(scores, is_swe)

    report = CandidateReport(
        session_id=session.id,
        skill_scores=skill_scores,
        behavioral_scores=behavioral_scores,
        ai_summary=scores.get("summary", ""),
        strengths=scores.get("strengths", []),
        concerns=scores.get("concerns", []),
        recommendation=_normalize_recommendation(scores.get("recommendation", "")),
        confidence_score=float(scores.get("confidence_score", 0.5)),
        extended_data=extended_data or {},
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


def _build_transcript(messages: list[InterviewMessage]) -> str:
    transcript_lines = []
    for msg in messages:
        speaker = "Interviewer" if msg.role == "interviewer" else "Candidate"
        transcript_lines.append(f"{speaker}: {msg.content}")
    return "\n\n".join(transcript_lines)


def _parse_score_response(response_text: str, is_swe: bool = False) -> dict:
    """Parse LLM JSON response. Returns fallback dict on failure."""
    fallback = {
        "skill_scores": {},
        "behavioral_scores": {},
        "overall_score": 5.0,
        "confidence_score": 0.3,
        "summary": "Unable to parse scoring response.",
        "strengths": [],
        "concerns": ["Scoring analysis encountered an error."],
        "recommendation": "No Hire",
    }
    if is_swe:
        fallback["technical_scores"] = {}
        fallback["experience_level_assessment"] = ""
        fallback["suggested_follow_up_areas"] = []
        fallback["hiring_level_fit"] = ""

    try:
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        return json_mod.loads(cleaned)
    except json_mod.JSONDecodeError as e:
        logger.error("score_parse_failed", raw=response_text[:200], error=str(e))
        return fallback


def _extract_report_data(scores: dict, is_swe: bool) -> tuple[dict, dict, dict]:
    """Extract skill_scores, behavioral_scores, and extended_data from parsed response."""
    if is_swe:
        skill_scores = scores.get("technical_scores", {})
        behavioral_scores = scores.get("behavioral_scores", {})
        extended_data = {
            "experience_level_assessment": scores.get("experience_level_assessment", ""),
            "suggested_follow_up_areas": scores.get("suggested_follow_up_areas", []),
            "hiring_level_fit": scores.get("hiring_level_fit", ""),
        }
    else:
        skill_scores = scores.get("skill_scores", {})
        behavioral_scores = scores.get("behavioral_scores", {})
        extended_data = {}
    return skill_scores, behavioral_scores, extended_data


def _normalize_recommendation(raw: str) -> str:
    raw_lower = raw.lower().replace(" ", "_")
    if "strong_hire" in raw_lower or "stronghire" in raw_lower:
        return "strong_hire"
    if "no_hire" in raw_lower or "nohire" in raw_lower or "lean_no_hire" in raw_lower:
        return "no_hire"
    if "hire" in raw_lower:
        return "hire"
    return "no_hire"
