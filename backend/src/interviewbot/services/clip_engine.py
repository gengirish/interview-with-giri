"""AI Clip Engine - extracts noteworthy moments from interview transcripts."""

from __future__ import annotations

import json

import structlog

from interviewbot.services.ai_engine import AIEngine

logger = structlog.get_logger()

CLIP_EXTRACTION_PROMPT = """Analyze this interview transcript and identify the 3-7 most noteworthy moments.

Job Title: {title}
Transcript:
{transcript}

Categories:
- best_answer: Candidate gave an exceptionally strong response
- red_flag: Response revealed a significant concern
- key_insight: Revealed important information about candidate's thinking
- culture_signal: Showed alignment or misalignment with team values
- technical_deep_dive: Demonstrated deep technical expertise
- growth_indicator: Showed capacity for learning and development

For each clip, provide:
1. category (one of the above)
2. title (10 words max, compelling)
3. description (1-2 sentences explaining why this moment matters)
4. start_index (message index where clip starts, 0-based)
5. end_index (message index where clip ends, 0-based)
6. importance (0.0 to 1.0)

Return ONLY valid JSON array:
[
  {{
    "category": "best_answer",
    "title": "Exceptional System Design Answer",
    "description": "Candidate demonstrated deep understanding of distributed systems with practical examples.",
    "start_index": 4,
    "end_index": 5,
    "importance": 0.95
  }}
]"""


async def extract_clips(messages: list[dict], job_title: str) -> list[dict]:
    """Extract noteworthy clips from interview messages using AI."""
    transcript = "\n".join(
        f"[{i}] {m.get('role', 'unknown')}: {m.get('content', '')}"
        for i, m in enumerate(messages)
    )
    prompt = CLIP_EXTRACTION_PROMPT.format(title=job_title, transcript=transcript[:15000])
    engine = AIEngine()
    raw = await engine.chat(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=4096,
    )
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        clips = json.loads(cleaned)
        return clips if isinstance(clips, list) else []
    except (json.JSONDecodeError, TypeError) as e:
        logger.error("clip_extraction_parse_failed", error=str(e), raw=raw[:300])
        return []
