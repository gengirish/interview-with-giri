"""Engagement analyzer: compute behavioral micro-signals from interview messages."""

from __future__ import annotations

import re

HEDGING_PHRASES = [
    r"\bi think\b",
    r"\bmaybe\b",
    r"\bprobably\b",
    r"\bperhaps\b",
    r"\bsort of\b",
    r"\bkind of\b",
    r"\bi guess\b",
    r"\bnot sure\b",
    r"\bmight be\b",
    r"\bcould be\b",
    r"\bpossibly\b",
    r"\bi believe\b",
    r"\bit seems\b",
    r"\bmore or less\b",
]

ASSERTIVE_PHRASES = [
    r"\bi built\b",
    r"\bi led\b",
    r"\bi designed\b",
    r"\bi implemented\b",
    r"\bdefinitely\b",
    r"\babsolutely\b",
    r"\bclearly\b",
    r"\bwithout doubt\b",
    r"\bi am confident\b",
    r"\bi know\b",
    r"\bi achieved\b",
    r"\bi delivered\b",
    r"\bi managed\b",
    r"\bi created\b",
    r"\bspecifically\b",
]


def compute_message_metrics(
    content: str,
    response_latency_ms: int | None = None,
) -> dict:
    """Compute engagement metrics for a single message."""
    words = content.split()
    word_count = len(words)
    sentences = [s.strip() for s in re.split(r"[.!?]+", content) if s.strip()]
    elaboration_depth = len(sentences)

    text_lower = content.lower()

    # Hedging score (0-1)
    hedge_count = sum(1 for p in HEDGING_PHRASES if re.search(p, text_lower))
    max_hedge = min(len(sentences), len(HEDGING_PHRASES))
    hedging_score = round(hedge_count / max(max_hedge, 1), 2)

    # Assertiveness score (0-1)
    assert_count = sum(1 for p in ASSERTIVE_PHRASES if re.search(p, text_lower))
    max_assert = min(len(sentences), len(ASSERTIVE_PHRASES))
    assertiveness_score = round(assert_count / max(max_assert, 1), 2)

    # Words per minute (estimated from latency)
    wpm = 0.0
    if response_latency_ms and response_latency_ms > 0:
        minutes = response_latency_ms / 60000
        wpm = round(word_count / minutes, 1) if minutes > 0 else 0

    return {
        "response_latency_ms": response_latency_ms,
        "word_count": word_count,
        "words_per_minute": wpm,
        "hedging_score": hedging_score,
        "assertiveness_score": assertiveness_score,
        "elaboration_depth": elaboration_depth,
        "question_engagement": round(
            1.0 - hedging_score * 0.3 + assertiveness_score * 0.3, 2
        ),
    }


def compute_engagement_profile(messages_with_metrics: list[dict]) -> dict:
    """Aggregate per-message metrics into an engagement profile."""
    if not messages_with_metrics:
        return {
            "overall_engagement": 0,
            "response_speed": {},
            "confidence_pattern": {},
            "elaboration_trend": {},
            "notable_signals": [],
        }

    latencies = [
        m["response_latency_ms"]
        for m in messages_with_metrics
        if m.get("response_latency_ms")
    ]
    hedging_scores = [m["hedging_score"] for m in messages_with_metrics]
    assertiveness_scores = [m["assertiveness_score"] for m in messages_with_metrics]
    elaboration_depths = [m["elaboration_depth"] for m in messages_with_metrics]
    engagements = [m.get("question_engagement", 0.5) for m in messages_with_metrics]

    # Response speed
    avg_latency = sum(latencies) / len(latencies) if latencies else 0
    latency_trend = "stable"
    if len(latencies) >= 3:
        first_half = sum(latencies[: len(latencies) // 2]) / max(
            len(latencies) // 2, 1
        )
        second_half = sum(latencies[len(latencies) // 2 :]) / max(
            len(latencies) - len(latencies) // 2, 1
        )
        if second_half < first_half * 0.8:
            latency_trend = "improving"
        elif second_half > first_half * 1.2:
            latency_trend = "slowing"

    # Confidence pattern (inverse of hedging + assertiveness)
    confidence_values = [
        round(1 - h * 0.5 + a * 0.5, 2)
        for h, a in zip(hedging_scores, assertiveness_scores)
    ]
    confidence_arc = [{"q": i + 1, "v": v} for i, v in enumerate(confidence_values)]
    avg_confidence = (
        round(sum(confidence_values) / len(confidence_values), 2)
        if confidence_values
        else 0
    )

    # Elaboration trend
    avg_elaboration = (
        round(sum(elaboration_depths) / len(elaboration_depths), 1)
        if elaboration_depths
        else 0
    )
    elab_trend = "stable"
    if len(elaboration_depths) >= 3:
        first_half_e = sum(elaboration_depths[: len(elaboration_depths) // 2]) / max(
            len(elaboration_depths) // 2, 1
        )
        second_half_e = sum(
            elaboration_depths[len(elaboration_depths) // 2 :]
        ) / max(len(elaboration_depths) - len(elaboration_depths) // 2, 1)
        if second_half_e > first_half_e * 1.2:
            elab_trend = "increasing"
        elif second_half_e < first_half_e * 0.8:
            elab_trend = "decreasing"

    # Notable signals
    signals = []
    for i, m in enumerate(messages_with_metrics):
        if m["assertiveness_score"] >= 0.6:
            signals.append(
                {
                    "type": "confidence_spike",
                    "question_index": i + 1,
                    "detail": f"High assertiveness on Q{i + 1}",
                }
            )
        if m["hedging_score"] >= 0.5:
            signals.append(
                {
                    "type": "hesitation_cluster",
                    "question_index": i + 1,
                    "detail": f"Significant hedging on Q{i + 1}",
                }
            )
        if m.get("response_latency_ms") and m["response_latency_ms"] > 30000:
            signals.append(
                {
                    "type": "long_pause",
                    "question_index": i + 1,
                    "detail": f"Extended response time ({m['response_latency_ms'] // 1000}s) on Q{i + 1}",
                }
            )

    # Overall engagement
    overall = round(sum(engagements) / len(engagements), 2) if engagements else 0

    consistency = 0
    if latencies:
        spread = max(latencies) - min(latencies)
        consistency = round(1 - spread / max(max(latencies), 1), 2)

    # Per-question latency for response speed chart
    per_question = [
        {"q": i + 1, "ms": m["response_latency_ms"]}
        for i, m in enumerate(messages_with_metrics)
        if m.get("response_latency_ms")
    ]

    return {
        "overall_engagement": overall,
        "response_speed": {
            "avg_ms": round(avg_latency),
            "trend": latency_trend,
            "consistency": consistency,
            "per_question": per_question,
        },
        "confidence_pattern": {"avg": avg_confidence, "arc": confidence_arc},
        "elaboration_trend": {"avg_depth": avg_elaboration, "trend": elab_trend},
        "notable_signals": signals[:10],
    }
