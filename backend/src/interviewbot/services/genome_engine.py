"""Competency Genome Engine: extracts and merges competency profiles from interview reports."""

from __future__ import annotations

import json
import re

from interviewbot.services.ai_engine import AIEngine

COMPETENCY_DIMENSIONS = [
    "problem_solving",
    "system_design",
    "data_structures",
    "algorithms",
    "code_quality",
    "debugging",
    "architecture",
    "database_design",
    "api_design",
    "security_awareness",
    "communication",
    "leadership",
    "teamwork",
    "adaptability",
    "conflict_resolution",
    "time_management",
    "initiative",
    "business_acumen",
    "customer_focus",
    "innovation",
    "decision_making",
    "analytical_thinking",
    "cultural_alignment",
    "growth_mindset",
]

EXTRACTION_PROMPT = """Given this interview report, map the candidate's performance to our competency taxonomy.

Report:
- Skill scores: {skill_scores}
- Behavioral scores: {behavioral_scores}
- AI Summary: {ai_summary}
- Strengths: {strengths}
- Concerns: {concerns}

Map to these dimensions (score 0-10, confidence 0.0-1.0):
{dimensions}

Only score dimensions that have evidence in the report. Leave others out.

Return ONLY valid JSON:
{{
  "problem_solving": {{"score": 8.5, "confidence": 0.9, "evidence": "Broke down the problem systematically..."}},
  "communication": {{"score": 7.0, "confidence": 0.8, "evidence": "Clear explanations but could be more concise..."}}
}}"""


def _extract_json_from_response(raw: str) -> dict:
    """Extract JSON from LLM response, handling markdown code blocks."""
    text = raw.strip()
    # Try to find ```json ... ``` or ``` ... ```
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        text = match.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {}


async def extract_genome_from_report(report) -> dict:
    """Extract competency dimensions from a candidate report using AI."""
    prompt = EXTRACTION_PROMPT.format(
        skill_scores=json.dumps(report.skill_scores or {}),
        behavioral_scores=json.dumps(report.behavioral_scores or {}),
        ai_summary=report.ai_summary or "",
        strengths=json.dumps(report.strengths or []),
        concerns=json.dumps(report.concerns or []),
        dimensions=", ".join(COMPETENCY_DIMENSIONS),
    )
    engine = AIEngine()
    raw = await engine.chat([{"role": "user", "content": prompt}])
    return _extract_json_from_response(raw)


def merge_genomes(existing_data: dict, new_dimensions: dict, session_id: str) -> dict:
    """Merge new dimension scores into existing genome using confidence-weighted averaging."""
    dimensions = dict(existing_data.get("dimensions", {}))
    for dim, new_val in new_dimensions.items():
        if not isinstance(new_val, dict) or "score" not in new_val:
            continue
        if dim not in dimensions:
            dimensions[dim] = {
                "score": new_val["score"],
                "confidence": new_val.get("confidence", 0.5),
                "sources": [{"session_id": session_id, "score": new_val["score"]}],
            }
        else:
            existing = dimensions[dim]
            sources = list(existing.get("sources", []))
            sources.append({"session_id": session_id, "score": new_val["score"]})
            # Confidence-weighted average, more recent = higher weight
            total_weight = 0.0
            weighted_sum = 0.0
            for i, s in enumerate(sources):
                weight = 1.0 + (i * 0.5)
                weighted_sum += s["score"] * weight
                total_weight += weight
            dimensions[dim] = {
                "score": (
                    round(weighted_sum / total_weight, 1) if total_weight else new_val["score"]
                ),
                "confidence": min(1.0, existing.get("confidence", 0.5) + 0.1),
                "sources": sources,
            }
    existing_data = dict(existing_data)
    existing_data["dimensions"] = dimensions
    session_ids = set(
        s["session_id"] for d in dimensions.values() for s in d.get("sources", [])
    )
    existing_data["interview_count"] = len(session_ids)
    return existing_data


def compute_match_percentage(genome_data: dict, ideal_genome: dict) -> dict:
    """Compare candidate genome against a role profile."""
    dimensions = genome_data.get("dimensions", {})
    matches: list[str] = []
    gaps: list[dict] = []
    overqualified: list[str] = []
    total_weight = 0.0
    weighted_score = 0.0

    for dim, ideal in ideal_genome.items():
        if not isinstance(ideal, dict):
            continue
        weight = ideal.get("weight", 1.0)
        ideal_score = ideal.get("ideal", 7)
        min_score = ideal.get("min", 5)
        total_weight += weight

        if dim in dimensions:
            actual = dimensions[dim].get("score", 0)
            if actual >= ideal_score:
                weighted_score += weight
                if actual > ideal_score + 1:
                    overqualified.append(dim)
            elif actual >= min_score:
                ratio = (actual - min_score) / (ideal_score - min_score) if ideal_score > min_score else 1.0
                weighted_score += weight * ratio
                matches.append(dim)
            else:
                gaps.append({"dimension": dim, "actual": actual, "required": min_score})
        else:
            gaps.append({"dimension": dim, "actual": None, "required": min_score})

    match_pct = round((weighted_score / total_weight * 100) if total_weight else 0, 1)
    return {
        "match_percentage": match_pct,
        "gaps": gaps,
        "overqualified": overqualified,
    }
