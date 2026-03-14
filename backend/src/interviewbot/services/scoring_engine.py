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
from interviewbot.services.engagement_analyzer import (
    compute_engagement_profile,
    compute_message_metrics,
)

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
    rubric = job.scoring_rubric
    is_swe = (job.role_type or "").lower() in _SWE_ROLE_TYPES

    if rubric and isinstance(rubric, list) and len(rubric) > 0:
        prompt = _build_custom_rubric_prompt(transcript, job, rubric)
        is_swe = False
    elif is_swe:
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

    # Compute engagement metrics for candidate messages and build profile
    messages_with_metrics: list[dict] = []
    prev_ts = None
    for msg in messages:
        if msg.role != "candidate":
            prev_ts = msg.created_at
            continue
        latency_ms = None
        if prev_ts and msg.created_at:
            delta = msg.created_at - prev_ts
            latency_ms = int(delta.total_seconds() * 1000)
        metrics = compute_message_metrics(msg.content, response_latency_ms=latency_ms)
        msg.engagement_metrics = metrics
        messages_with_metrics.append(metrics)
        prev_ts = msg.created_at

    engagement_profile = compute_engagement_profile(messages_with_metrics)
    await db.commit()

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
        engagement_profile=engagement_profile,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    # Generate highlights
    import contextlib

    with contextlib.suppress(Exception):
        from interviewbot.services.highlight_engine import generate_highlights

        highlights = await generate_highlights(str(session.id), db)
        if highlights:
            report.extended_data = {
                **(report.extended_data or {}),
                "highlights": highlights,
            }
            await db.commit()

    logger.info(
        "interview_scored",
        session_id=session_id,
        overall_score=overall,
        recommendation=report.recommendation,
    )
    return report


def _build_custom_rubric_prompt(transcript: str, job: JobPosting, rubric: list[dict]) -> str:
    """Build a scoring prompt using custom rubric dimensions."""
    dimensions_text = "\n".join(
        f"- **{dim['dimension']}** (weight: {dim.get('weight', 1.0)}): "
        f"{dim.get('description', '')}"
        for dim in rubric
    )
    skills = ", ".join(job.required_skills or [])

    return f"""Analyze this interview transcript and score the candidate using the custom rubric.

## Transcript
{transcript[:8000]}

## Job Context
- Role: {job.title}
- Required Skills: {skills}

## Custom Scoring Rubric
Score each of these dimensions from 0.0 to 10.0:

{dimensions_text}

Return a JSON object:
{{
  "skill_scores": {{
    "dimension_name": {{"score": 8.0, "evidence": "Quote from transcript", "notes": "Assessment"}},
    ...one entry per rubric dimension...
  }},
  "behavioral_scores": {{}},
  "overall_score": 7.5,
  "confidence_score": 0.85,
  "summary": "3-4 sentence executive summary",
  "strengths": ["Specific strength with evidence"],
  "concerns": ["Specific concern with evidence"],
  "recommendation": "Strong Hire | Hire | Lean No Hire | No Hire"
}}

IMPORTANT:
- Score ALL dimensions listed in the rubric above.
- Weight the overall_score according to the weights provided.
- Every score MUST have direct evidence from the transcript.
- If a dimension was not assessed during the interview, score it as null and note "Not assessed."

Return ONLY valid JSON, no markdown or explanation."""


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
