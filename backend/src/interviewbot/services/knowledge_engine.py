"""Knowledge base engine: extract insights from interviews and answer natural language queries."""

from __future__ import annotations

import json

from interviewbot.services.ai_engine import AIEngine

EXTRACTION_PROMPT = """Analyze these {count} completed interviews for {role_type} roles.

Summary data:
{summary_data}

Extract insights in these categories:
1. question_insight — Which question topics correlate with strong candidates
2. role_pattern — Common strengths and weaknesses for this role type
3. skill_benchmark — Average scores per skill, notable trends
4. process_recommendation — Optimal interview configuration

Return ONLY valid JSON array:
[
  {{
    "category": "question_insight",
    "title": "System Design Questions Are Strongest Predictors",
    "content": "Candidates who scored above 8 on system design questions had a 78% hire rate...",
    "confidence": 0.85,
    "tags": ["system_design", "prediction"]
  }}
]"""

QUERY_PROMPT = """You are the hiring knowledge assistant for an organization.

Available knowledge base entries:
{knowledge_entries}

Organization's interview statistics:
- Total completed interviews: {total_interviews}
- Average score: {avg_score}
- Pass rate: {pass_rate}%
- Top roles: {top_roles}

User question: {query}

Answer the question using the knowledge base and statistics.
Be specific, cite data when possible, and provide actionable insights.
If you don't have enough data to answer confidently, say so.

Return your answer as a clear, helpful paragraph (2-5 sentences)."""

SUGGESTION_PROMPT = """Based on recent hiring data:
- {total_interviews} interviews in the last 30 days
- Average score: {avg_score}
- Pass rate: {pass_rate}%
- Most tested roles: {top_roles}

Generate 3-5 proactive insights that would be valuable to a hiring manager.
Focus on trends, anomalies, or actionable recommendations.

Return ONLY valid JSON array:
[
  {{
    "title": "Pass rate dropped 15% for React roles",
    "detail": "Consider revisiting question difficulty or expanding the candidate pool",
    "type": "warning"
  }}
]"""


async def extract_knowledge(interviews_data: list[dict], role_type: str) -> list[dict]:
    """Extract knowledge entries from interview summary data."""
    summary = json.dumps(interviews_data[:20], default=str)  # Cap to avoid token overflow
    prompt = EXTRACTION_PROMPT.format(
        count=len(interviews_data),
        role_type=role_type,
        summary_data=summary,
    )
    engine = AIEngine()
    raw = await engine.chat([{"role": "user", "content": prompt}])
    try:
        entries = json.loads(raw)
        return entries if isinstance(entries, list) else []
    except Exception:
        return []


async def query_knowledge(
    query: str,
    knowledge_entries: list[dict],
    stats: dict,
) -> str:
    """Answer a natural language query using knowledge entries and org stats."""
    entries_text = "\n".join(
        f"- [{e.get('category')}] {e.get('title')}: {e.get('content')}"
        for e in knowledge_entries[:15]
    )
    prompt = QUERY_PROMPT.format(
        knowledge_entries=entries_text or "(No knowledge entries yet)",
        total_interviews=stats.get("total_interviews", 0),
        avg_score=stats.get("avg_score", "N/A"),
        pass_rate=stats.get("pass_rate", "N/A"),
        top_roles=", ".join(stats.get("top_roles", [])),
        query=query,
    )
    engine = AIEngine()
    return await engine.chat([{"role": "user", "content": prompt}])


async def generate_suggestions(stats: dict) -> list[dict]:
    """Generate proactive insights based on recent hiring data."""
    prompt = SUGGESTION_PROMPT.format(
        total_interviews=stats.get("total_interviews", 0),
        avg_score=stats.get("avg_score", "N/A"),
        pass_rate=stats.get("pass_rate", "N/A"),
        top_roles=", ".join(stats.get("top_roles", [])),
    )
    engine = AIEngine()
    raw = await engine.chat([{"role": "user", "content": prompt}])
    try:
        result = json.loads(raw)
        return result if isinstance(result, list) else []
    except Exception:
        return []
