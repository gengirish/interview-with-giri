"""AI Interview Co-Pilot engine: suggestions, legal checks, competency coverage."""

from __future__ import annotations

import json

from interviewbot.services.ai_engine import AIEngine

SUGGESTION_PROMPT = """You are an interview co-pilot assisting a hiring manager in real-time.

Job: {title} | Required Skills: {required_skills}
Competencies NOT yet covered: {uncovered_skills}
Time elapsed: ~{elapsed_minutes} minutes

Recent transcript (last 4 messages):
{recent_transcript}

Generate 2-3 follow-up question suggestions. Each should:
1. Target an uncovered competency if possible
2. Build naturally on what the candidate just said
3. Include a brief rationale (1 sentence)

Return ONLY valid JSON array:
[
  {{
    "question": "Can you walk me through how you'd design the caching layer?",
    "targets_skill": "System Design",
    "rationale": "Candidate mentioned Redis but didn't explain their caching strategy",
    "difficulty": "medium"
  }}
]"""

LEGAL_CHECK_PROMPT = """Check this interview question for legal/bias risks.

Question: "{question}"

Check for:
- Age-related inquiries
- Family/marital status
- Religion/national origin
- Disability/health
- Gender-coded language

If problematic, return JSON:
{{"is_risky": true, "risk_type": "age_bias", "severity": "warning", "suggestion": "alternative question"}}

If safe, return:
{{"is_risky": false}}

Return ONLY valid JSON."""


async def generate_suggestions(
    job_title: str,
    required_skills: list[str],
    uncovered_skills: list[str],
    recent_transcript: str,
    elapsed_minutes: int,
) -> list[dict]:
    prompt = SUGGESTION_PROMPT.format(
        title=job_title,
        required_skills=", ".join(required_skills),
        uncovered_skills=", ".join(uncovered_skills),
        recent_transcript=recent_transcript,
        elapsed_minutes=elapsed_minutes,
    )
    engine = AIEngine()
    raw = await engine.chat([{"role": "user", "content": prompt}])
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []


async def check_legal_risk(question_text: str) -> dict:
    engine = AIEngine()
    raw = await engine.chat(
        [{"role": "user", "content": LEGAL_CHECK_PROMPT.format(question=question_text)}]
    )
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {"is_risky": False}


def compute_coverage(required_skills: list[str], messages: list[dict]) -> dict:
    coverage: dict = {}
    transcript_lower = " ".join(m.get("content", "") for m in messages).lower()
    for skill in required_skills:
        skill_lower = skill.lower()
        mentions = transcript_lower.count(skill_lower)
        if mentions == 0:
            coverage[skill] = {"covered": False, "depth": 0}
        elif mentions <= 2:
            coverage[skill] = {"covered": True, "depth": 1}
        elif mentions <= 5:
            coverage[skill] = {"covered": True, "depth": 2}
        else:
            coverage[skill] = {"covered": True, "depth": 3}
    return coverage
