"""Cultural fit & values assessment engine."""

from __future__ import annotations

import json
import re

from interviewbot.services.ai_engine import AIEngine

QUESTION_GENERATION_PROMPT = """Company value: "{name}" — {definition}
Behavioral indicators: {indicators}

Generate 2 scenario-based interview questions that assess this value.
Questions should present realistic workplace situations and ask the candidate how they would respond.
Avoid direct questions like "Do you value {name}?"

Return ONLY valid JSON array:
[
  {{"question": "Tell me about a time when...", "probes": ["What was the outcome?", "What did you learn?"]}}
]"""

ASSESSMENT_PROMPT = """Analyze this interview transcript for cultural fit against company values.

Company values:
{values_json}

Interview transcript:
{transcript}

For each value, analyze the candidate's responses and assess alignment.
Look for behavioral indicators mentioned by the candidate, even indirectly.

Return ONLY valid JSON:
{{
  "value_scores": {{
    "{example_value}": {{
      "score": 7.5,
      "confidence": 0.8,
      "evidence": ["Specific quote or observation from transcript"]
    }}
  }},
  "overall_fit_score": 7.2,
  "fit_label": "Good Fit",
  "narrative": "2-3 paragraph assessment of cultural alignment..."
}}

Fit labels: >=8 "Strong Fit", >=6 "Good Fit", >=4 "Moderate Fit", <4 "Weak Fit"
"""


def _extract_json(raw: str) -> str:
    """Extract JSON from LLM output, handling markdown code blocks."""
    text = raw.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return match.group(1).strip()
    return text


async def generate_value_questions(values: list[dict]) -> dict:
    """Generate scenario-based questions for each company value."""
    all_questions: dict = {}
    engine = AIEngine()
    for value in values:
        prompt = QUESTION_GENERATION_PROMPT.format(
            name=value.get("name", ""),
            definition=value.get("definition", ""),
            indicators=", ".join(value.get("behavioral_indicators", [])),
        )
        raw = await engine.chat([{"role": "user", "content": prompt}])
        try:
            extracted = _extract_json(raw)
            questions = json.loads(extracted)
            all_questions[value["name"]] = questions if isinstance(questions, list) else []
        except (json.JSONDecodeError, TypeError):
            all_questions[value["name"]] = []
    return all_questions


async def assess_values(values: list[dict], transcript: str) -> dict:
    """Assess candidate responses against company values."""
    values_json = json.dumps(values, indent=2)
    example_value = values[0]["name"] if values else "Ownership"
    prompt = ASSESSMENT_PROMPT.format(
        values_json=values_json,
        transcript=transcript,
        example_value=example_value,
    )
    engine = AIEngine()
    raw = await engine.chat([{"role": "user", "content": prompt}])
    try:
        extracted = _extract_json(raw)
        return json.loads(extracted)
    except (json.JSONDecodeError, TypeError):
        return {
            "value_scores": {},
            "overall_fit_score": 0,
            "fit_label": "Unknown",
            "narrative": "Assessment failed.",
        }
