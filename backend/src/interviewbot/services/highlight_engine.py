"""AI Highlight Engine - identifies key moments in interview transcripts."""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.models.tables import InterviewMessage, InterviewSession
from interviewbot.services.ai_engine import AIEngine

logger = structlog.get_logger()

HIGHLIGHT_PROMPT = """Analyze this interview transcript and identify 5-8 key moments.

## Transcript
{transcript}

## Candidate Info
- Name: {candidate_name}
- Score: {overall_score}/10

## Instructions
Identify the key moments that a hiring manager should review. For each highlight:
- message_index: the 0-based index of the message in the transcript
- type: one of "strong_answer", "weak_answer", "creative_thinking", "red_flag",
  "coding_breakthrough", "deep_insight", "struggle", "growth_moment"
- label: A 5-10 word description (e.g., "Strong system design thinking",
  "Struggled with async concepts")
- summary: 1-2 sentence explanation of why this moment matters
- speaker: "candidate" or "interviewer"

Return JSON:
{{
  "highlights": [
    {{
      "message_index": 3,
      "type": "strong_answer",
      "label": "Excellent explanation of microservices",
      "summary": "Candidate demonstrated deep understanding of service decomposition.",
      "speaker": "candidate"
    }}
  ]
}}

Return ONLY valid JSON."""


async def generate_highlights(session_id: str, db: AsyncSession) -> list[dict] | None:
    """Generate AI highlights for a completed interview session."""
    result = await db.execute(select(InterviewSession).where(InterviewSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        return None

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
        transcript_lines.append(f"[{i}] {speaker}: {msg.content}")
    transcript = "\n\n".join(transcript_lines)

    prompt = HIGHLIGHT_PROMPT.format(
        transcript=transcript[:10000],
        candidate_name=session.candidate_name or "Unknown",
        overall_score=session.overall_score or "N/A",
    )

    engine = AIEngine()
    raw = await engine.chat(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=2048,
    )

    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        data = json.loads(cleaned)
        highlights = data.get("highlights", [])

        # Enrich with timestamps from messages
        for h in highlights:
            idx = h.get("message_index", 0)
            if 0 <= idx < len(messages):
                h["timestamp"] = str(messages[idx].created_at)
                h["content_preview"] = messages[idx].content[:150]

        return highlights
    except (json.JSONDecodeError, KeyError) as e:
        logger.error("highlight_parse_failed", error=str(e), raw=raw[:200])
        return None
