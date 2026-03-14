"""AI Coaching Engine - generates personalized coaching reports for practice sessions."""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.models.tables import InterviewMessage, InterviewSession, JobPosting
from interviewbot.services.ai_engine import AIEngine

logger = structlog.get_logger()

COACHING_PROMPT = """You are an expert interview coach analyzing a practice interview.

## Interview Context
- Role: {job_title}
- Role Type: {role_type}
- Required Skills: {skills}

## Transcript
{transcript}

## Your Task
Produce a detailed, actionable coaching report. Be specific — reference exact
answers from the transcript. Treat the candidate as someone preparing for a real
interview next week.

Return JSON:
{{
  "readiness_score": 72,
  "readiness_label": "Getting There",
  "summary": "2-3 sentence overall assessment",
  "strengths": [
    {{
      "title": "Clear Problem Decomposition",
      "detail": "Specific evidence from transcript, 1-2 sentences",
      "question_index": 1
    }}
  ],
  "improvements": [
    {{
      "title": "Add Metrics to Answers",
      "detail": "What to improve and how, referencing their specific answer",
      "tip": "One concrete, actionable tip the candidate can apply immediately",
      "priority": "high",
      "question_index": 2
    }}
  ],
  "question_feedback": [
    {{
      "question_index": 0,
      "question_summary": "Brief summary of what was asked",
      "score": 7,
      "what_went_well": "Specific positive observation",
      "what_to_improve": "Specific improvement suggestion",
      "sample_answer_snippet": "A brief example of how to strengthen their answer (2-3 sentences)"
    }}
  ],
  "study_plan": [
    {{
      "topic": "System Design",
      "reason": "Why this topic needs attention, based on their performance",
      "resources": "1-2 specific practice suggestions (e.g., 'Practice designing a URL shortener')"
    }}
  ],
  "star_method_tips": [
    "Specific tip about using the STAR method, if applicable to any of their answers"
  ]
}}

## Scoring Guide
- readiness_score: 0-100 representing interview readiness
- readiness_label: "Needs Work" (<40), "Getting There" (40-69),
  "Ready" (70-85), "Outstanding" (86-100)
- question_feedback score: 1-10 per question
- priority for improvements: "high", "medium", "low"

Be encouraging but honest. The goal is to help them improve.
Return ONLY valid JSON."""


async def generate_coaching_report(
    session_id: str, db: AsyncSession
) -> dict | None:
    """Generate a coaching report for a practice interview session."""
    result = await db.execute(
        select(InterviewSession).where(InterviewSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return None

    job_result = await db.execute(
        select(JobPosting).where(JobPosting.id == session.job_posting_id)
    )
    job = job_result.scalar_one_or_none()

    msg_result = await db.execute(
        select(InterviewMessage)
        .where(InterviewMessage.session_id == session_id)
        .order_by(InterviewMessage.created_at.asc())
    )
    messages = msg_result.scalars().all()
    if not messages:
        return None

    transcript_lines = []
    for i, msg in enumerate(messages):
        speaker = "Interviewer" if msg.role == "interviewer" else "Candidate"
        transcript_lines.append(f"[Q{i}] {speaker}: {msg.content}")
    transcript = "\n\n".join(transcript_lines)

    job_title = job.title if job else "Practice Interview"
    role_type = job.role_type if job else "technical"
    skills = ", ".join(job.required_skills or []) if job else "General"

    prompt = COACHING_PROMPT.format(
        job_title=job_title,
        role_type=role_type,
        skills=skills,
        transcript=transcript[:12000],
    )

    engine = AIEngine()
    raw = await engine.chat(
        [{"role": "user", "content": prompt}],
        temperature=0.4,
        max_tokens=3000,
    )

    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        report = json.loads(cleaned)
        report["session_id"] = session_id
        report["candidate_name"] = session.candidate_name or "Practice User"
        report["job_title"] = job_title
        report["role_type"] = role_type
        report["duration_seconds"] = session.duration_seconds
        return report
    except (json.JSONDecodeError, KeyError) as e:
        logger.error("coaching_parse_failed", error=str(e), raw=raw[:300])
        return None
