"""Interviewer Training Simulator: AI plays candidate, scores interviewer."""

from __future__ import annotations

import json
import random

from interviewbot.services.ai_engine import AIEngine

PERSONAS = [
    {
        "name": "Alex Chen",
        "experience_years": 5,
        "skill_level": "senior",
        "personality": "confident",
        "hidden_strengths": ["system design", "mentoring"],
        "hidden_weaknesses": ["time management"],
        "background": "5 years at mid-size startup, full-stack engineer",
    },
    {
        "name": "Jordan Smith",
        "experience_years": 2,
        "skill_level": "junior",
        "personality": "nervous",
        "hidden_strengths": ["quick learner", "attention to detail"],
        "hidden_weaknesses": ["public speaking"],
        "background": "2 years at consulting firm, focused on frontend",
    },
    {
        "name": "Sam Rivera",
        "experience_years": 8,
        "skill_level": "principal",
        "personality": "reserved",
        "hidden_strengths": ["architecture", "cross-team leadership"],
        "hidden_weaknesses": ["delegation"],
        "background": "8 years across FAANG and startups, backend/infra specialist",
    },
    {
        "name": "Taylor Kim",
        "experience_years": 3,
        "skill_level": "mid",
        "personality": "verbose",
        "hidden_strengths": ["problem solving", "creativity"],
        "hidden_weaknesses": ["following processes"],
        "background": "3 years at digital agency, full-stack with design background",
    },
    {
        "name": "Morgan Lee",
        "experience_years": 10,
        "skill_level": "senior",
        "personality": "concise",
        "hidden_strengths": ["strategic thinking", "stakeholder management"],
        "hidden_weaknesses": ["hands-on coding"],
        "background": "10 years, transitioned from engineer to engineering manager",
    },
]

PERSONALITY_DESCRIPTIONS = {
    "confident": "Speaks clearly and directly. Uses definitive language. Makes eye contact.",
    "nervous": "Tends to hedge with 'um', 'I think', 'maybe'. Shorter answers unless prompted.",
    "reserved": "Thoughtful and measured. Gives good answers but doesn't volunteer extra info.",
    "verbose": "Loves to talk. Goes into tangents. Needs to be guided back on track.",
    "concise": "Brief, to-the-point answers. Sometimes too short. Values efficiency.",
}

CANDIDATE_PROMPT = """You are roleplaying as a job candidate in a practice interview.

Your persona:
- Name: {name}
- Experience: {experience_years} years
- Skill level: {skill_level}
- Personality: {personality} — {personality_desc}
- Background: {background}
- Hidden strengths: {hidden_strengths} (reveal only if asked good probing questions)
- Hidden weaknesses: {hidden_weaknesses} (reveal only if interviewer creates safe space)

Rules:
1. Stay in character. Respond as this person would.
2. Give realistic answers — not perfect.
3. Only reveal hidden strengths/weaknesses if the interviewer asks insightful questions.
4. If asked an illegal question (age, marital status, etc.), respond naturally but note it internally.
5. Keep responses to 3-5 sentences unless asked to elaborate.
6. Address the interviewer's question directly.

Previous conversation:
{conversation}

Interviewer says: {message}

Respond in character as {name}:"""

SCORING_PROMPT = """You observed a practice interview. Score the INTERVIEWER (not the candidate).

Role being interviewed for: {role_type}
Candidate persona (for context): {persona_summary}

Transcript:
{transcript}

Score these dimensions (1-10) with specific feedback:
1. question_quality — Were questions clear, open-ended, relevant?
2. competency_coverage — Were key skills for a {role_type} assessed?
3. bias_avoidance — Any legally problematic questions?
4. candidate_experience — Did they build rapport? Respectful of time?
5. depth_vs_breadth — Good balance of exploration?
6. time_management — Efficient use of interview time?

Also provide 3 actionable tips for improvement.

Return ONLY valid JSON:
{{
  "overall": 7.5,
  "question_quality": {{"score": 8, "feedback": "Good mix of behavioral and technical"}},
  "competency_coverage": {{"score": 6, "feedback": "Missed system design entirely"}},
  "bias_avoidance": {{"score": 9, "feedback": "No problematic questions detected"}},
  "candidate_experience": {{"score": 7, "feedback": "Good rapport but could give more time"}},
  "depth_vs_breadth": {{"score": 7, "feedback": "Good balance"}},
  "time_management": {{"score": 6, "feedback": "Spent 60% on one topic"}},
  "tips": ["Try the STAR method to probe answers", "Ask follow-ups to go deeper", "Cover all required skills"]
}}"""


def get_random_persona() -> dict:
    return random.choice(PERSONAS).copy()


def get_all_personas() -> list[dict]:
    return [p.copy() for p in PERSONAS]


async def simulate_candidate_response(persona: dict, messages: list, new_message: str) -> str:
    conversation = "\n".join(
        f"{'Interviewer' if m['role'] == 'interviewer' else persona['name']}: {m['content']}"
        for m in messages
    )
    personality_desc = PERSONALITY_DESCRIPTIONS.get(persona.get("personality", "confident"), "")
    prompt = CANDIDATE_PROMPT.format(
        name=persona["name"],
        experience_years=persona.get("experience_years", 5),
        skill_level=persona.get("skill_level", "mid"),
        personality=persona.get("personality", "confident"),
        personality_desc=personality_desc,
        background=persona.get("background", ""),
        hidden_strengths=", ".join(persona.get("hidden_strengths", [])),
        hidden_weaknesses=", ".join(persona.get("hidden_weaknesses", [])),
        conversation=conversation or "(Interview just started)",
        message=new_message,
    )
    engine = AIEngine()
    return await engine.chat([{"role": "user", "content": prompt}])


async def score_interviewer(role_type: str, persona: dict, messages: list) -> dict:
    transcript = "\n".join(
        f"{'Interviewer' if m['role'] == 'interviewer' else persona.get('name', 'Candidate')}: {m['content']}"
        for m in messages
    )
    persona_summary = (
        f"{persona.get('name')} — {persona.get('experience_years')}yr "
        f"{persona.get('skill_level')} ({persona.get('personality')})"
    )
    prompt = SCORING_PROMPT.format(
        role_type=role_type,
        persona_summary=persona_summary,
        transcript=transcript,
    )
    engine = AIEngine()
    raw = await engine.chat([{"role": "user", "content": prompt}])
    try:
        return json.loads(raw)
    except Exception:
        return {"overall": 5, "tips": ["Unable to generate detailed scorecard"]}
