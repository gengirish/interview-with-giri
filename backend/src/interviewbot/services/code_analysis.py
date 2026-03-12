"""Code analysis service for pair-programming style follow-ups."""

from __future__ import annotations

import re

import structlog

from interviewbot.services.ai_engine import CODE_REVIEW_FOLLOW_UP_PROMPT, AIEngine

logger = structlog.get_logger()


def detect_language(code: str) -> str:
    """Best-effort language detection from code content."""
    indicators = {
        "python": [r"\bdef \w+", r"\bimport \w+", r"\bclass \w+.*:", r"print\("],
        "javascript": [r"\bfunction\b", r"\bconst\b", r"\blet\b", r"console\.log", r"=>"],
        "typescript": [r"\binterface\b", r": string\b", r": number\b", r"\btype \w+"],
        "java": [r"\bpublic class\b", r"\bSystem\.out", r"\bvoid\b", r"\bString\[\]"],
        "c++": [r"#include", r"\bcout\b", r"\bstd::", r"\bint main\b"],
        "go": [r"\bfunc\b", r"\bpackage\b", r"\bfmt\.", r":="],
        "rust": [r"\bfn\b", r"\blet mut\b", r"\bimpl\b", r"println!"],
    }
    scores: dict[str, int] = {}
    for lang, patterns in indicators.items():
        scores[lang] = sum(1 for p in patterns if re.search(p, code))
    if not scores or max(scores.values()) == 0:
        return "unknown"
    return max(scores, key=scores.get)


def extract_code_from_submission(message: str) -> str | None:
    """Extract code block from a [Code Submission] message."""
    if "[Code Submission]" not in message:
        return None
    match = re.search(r"```(?:\w+)?\n(.*?)```", message, re.DOTALL)
    return match.group(1).strip() if match else None


def analyze_code_patterns(code: str) -> dict:
    """Lightweight static analysis of code patterns."""
    lines = code.strip().split("\n")
    analysis = {
        "line_count": len(lines),
        "has_comments": any(line.strip().startswith(("#", "//", "/*", "*")) for line in lines),
        "has_error_handling": bool(re.search(r"\b(try|catch|except|finally|rescue)\b", code)),
        "has_tests": bool(re.search(r"\b(test_|describe|it\(|assert|expect)\b", code)),
        "has_type_hints": bool(re.search(r"(: \w+|-> \w+|\binterface\b|\btype \w+)", code)),
        "complexity_indicators": [],
    }

    if re.search(r"for .* in .*:\s*\n\s*for ", code) or re.search(r"for\s*\(.*for\s*\(", code):
        analysis["complexity_indicators"].append("nested_loops")
    if re.search(r"\b(recursion|recursive|def \w+.*\n.*\1)", code):
        analysis["complexity_indicators"].append("recursion")
    if re.search(r"\b(dict|map|Map|HashMap|hash_map|{}\s*\n)", code):
        analysis["complexity_indicators"].append("hash_map_usage")
    if re.search(r"\b(sort|sorted|\.sort\()", code):
        analysis["complexity_indicators"].append("sorting")

    return analysis


async def generate_code_follow_up(
    engine: AIEngine,
    code: str,
    problem_context: str,
    conversation_context: str,
    execution_result: dict | None = None,
) -> str:
    """Generate a pair-programming style follow-up based on submitted code."""
    language = detect_language(code)
    exec_data = execution_result or {}

    prompt = CODE_REVIEW_FOLLOW_UP_PROMPT.format(
        problem_context=problem_context,
        language=language,
        code=code[:3000],
        stdout=exec_data.get("stdout", "N/A"),
        stderr=exec_data.get("stderr", "N/A"),
        status=exec_data.get("status", "N/A"),
        conversation_context=conversation_context[-2000:],
    )

    response = await engine.chat(
        [{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=512,
    )
    return response
