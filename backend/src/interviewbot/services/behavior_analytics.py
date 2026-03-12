"""Candidate behavior analytics and anti-cheat detection."""

from __future__ import annotations

from datetime import UTC, datetime
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.models.schemas import BehaviorEventCreate, BehaviorSummary, IntegrityAssessment
from interviewbot.models.tables import BehaviorEvent

logger = structlog.get_logger()

PASTE_CHAR_THRESHOLD = 200
TAB_SWITCH_THRESHOLD = 5
AWAY_TIME_THRESHOLD_MS = 30_000
IDLE_THRESHOLD_MS = 60_000
PASTE_COUNT_THRESHOLD = 8


async def record_behavior_event(
    db: AsyncSession,
    session_id: uuid.UUID,
    event: BehaviorEventCreate,
) -> BehaviorEvent:
    behavior_event = BehaviorEvent(
        session_id=session_id,
        event_type=event.event_type,
        timestamp=event.timestamp or datetime.now(UTC),
        data=event.data,
    )
    db.add(behavior_event)
    await db.commit()
    await db.refresh(behavior_event)
    logger.info(
        "behavior_event_recorded",
        session_id=str(session_id),
        event_type=event.event_type,
    )
    return behavior_event


async def record_batch_events(
    db: AsyncSession,
    session_id: uuid.UUID,
    events: list[BehaviorEventCreate],
) -> int:
    for event in events:
        db.add(
            BehaviorEvent(
                session_id=session_id,
                event_type=event.event_type,
                timestamp=event.timestamp or datetime.now(UTC),
                data=event.data,
            )
        )
    await db.commit()
    logger.info(
        "behavior_events_batch_recorded",
        session_id=str(session_id),
        count=len(events),
    )
    return len(events)


async def get_behavior_summary(db: AsyncSession, session_id: uuid.UUID) -> BehaviorSummary:
    result = await db.execute(select(BehaviorEvent).where(BehaviorEvent.session_id == session_id))
    events = result.scalars().all()

    summary = BehaviorSummary()
    typing_speeds: list[float] = []

    for event in events:
        data = event.data or {}
        match event.event_type:
            case "keystroke":
                summary.total_keystrokes += 1
                if wpm := data.get("wpm"):
                    typing_speeds.append(wpm)
            case "paste":
                summary.total_pastes += 1
                summary.total_paste_chars += data.get("content_length", 0)
            case "tab_switch":
                summary.tab_switches += 1
                summary.total_away_time_ms += data.get("away_duration_ms", 0)
            case "focus_loss":
                summary.focus_losses += 1
                summary.total_away_time_ms += data.get("duration_ms", 0)
            case "idle":
                idle_ms = data.get("duration_ms", 0)
                summary.longest_idle_ms = max(summary.longest_idle_ms, idle_ms)
            case "code_submit":
                summary.code_submissions += 1

    if typing_speeds:
        summary.avg_typing_speed_wpm = round(sum(typing_speeds) / len(typing_speeds), 1)

    summary.integrity_score, summary.flags = _compute_integrity(summary)
    return summary


def _compute_integrity(summary: BehaviorSummary) -> tuple[float, list[str]]:
    score = 10.0
    flags: list[str] = []

    if summary.total_pastes > PASTE_COUNT_THRESHOLD:
        score -= 2.0
        flags.append("excessive_pasting")
    if summary.total_paste_chars > PASTE_CHAR_THRESHOLD * 3:
        score -= 1.5
        flags.append("large_paste_content")
    if summary.tab_switches > TAB_SWITCH_THRESHOLD:
        score -= 1.5
        flags.append("frequent_tab_switches")
    if summary.total_away_time_ms > AWAY_TIME_THRESHOLD_MS:
        score -= 1.0
        flags.append("extended_away_time")
    if summary.longest_idle_ms > IDLE_THRESHOLD_MS:
        score -= 0.5
        flags.append("long_idle_period")
    if summary.total_keystrokes == 0 and summary.code_submissions > 0:
        score -= 3.0
        flags.append("no_typing_detected")

    return max(score, 0.0), flags


async def get_integrity_assessment(db: AsyncSession, session_id: uuid.UUID) -> IntegrityAssessment:
    summary = await get_behavior_summary(db, session_id)

    if summary.integrity_score >= 8.0:
        risk_level = "low"
    elif summary.integrity_score >= 5.0:
        risk_level = "medium"
    else:
        risk_level = "high"

    flag_descriptions = {
        "excessive_pasting": "Candidate pasted code frequently, suggesting external assistance",
        "large_paste_content": "Large blocks of code were pasted rather than typed",
        "frequent_tab_switches": "Candidate switched away from the interview tab multiple times",
        "extended_away_time": "Significant time spent outside the interview window",
        "long_idle_period": "Extended period of inactivity during the interview",
        "no_typing_detected": "Code was submitted but no typing activity was recorded",
    }

    flag_details = [flag_descriptions.get(f, f) for f in summary.flags]
    if not flag_details:
        assessment_summary = (
            "No suspicious behavior detected. Candidate appears to have completed "
            "the interview independently."
        )
    else:
        assessment_summary = (
            f"Detected {len(flag_details)} behavioral flag(s) that may indicate "
            f"external assistance: {'; '.join(flag_details)}."
        )

    return IntegrityAssessment(
        integrity_score=round(summary.integrity_score, 1),
        risk_level=risk_level,
        flags=summary.flags,
        summary=assessment_summary,
        details=summary,
    )


async def get_composite_integrity(
    db: AsyncSession,
    session_id: uuid.UUID,
    audio_analysis: dict | None = None,
) -> IntegrityAssessment:
    """Enhanced integrity assessment combining behavior + audio signals."""
    summary = await get_behavior_summary(db, session_id)

    # Start with behavioral integrity
    score = summary.integrity_score
    flags = list(summary.flags)

    # Layer in audio analysis if available
    if audio_analysis:
        audio_flags = audio_analysis.get("audio_flags", [])
        speech_score = audio_analysis.get("speech_consistency_score", 10.0)

        # Weight audio signals
        if "unnaturally_consistent_timing" in audio_flags:
            score -= 1.5
            flags.append("unnaturally_consistent_timing")
        if "majority_fast_responses" in audio_flags:
            score -= 2.0
            flags.append("majority_fast_responses")
        elif "frequent_fast_responses" in audio_flags:
            score -= 1.0
            flags.append("frequent_fast_responses")
        if "very_low_avg_latency" in audio_flags:
            score -= 1.0
            flags.append("very_low_avg_latency")

        silence_data = audio_analysis.get("silence_analysis", {})
        if "excessive_silence" in silence_data.get("flags", []):
            score -= 0.5
            flags.append("excessive_silence_in_audio")
        if "audio_energy_spikes" in silence_data.get("flags", []):
            score -= 0.5
            flags.append("audio_energy_spikes")

    score = max(score, 0.0)

    if score >= 8.0:
        risk_level = "low"
    elif score >= 5.0:
        risk_level = "medium"
    else:
        risk_level = "high"

    flag_descriptions = {
        "excessive_pasting": "Candidate pasted code frequently",
        "large_paste_content": "Large blocks of code were pasted rather than typed",
        "frequent_tab_switches": "Candidate switched away from the interview tab multiple times",
        "extended_away_time": "Significant time spent outside the interview window",
        "long_idle_period": "Extended period of inactivity",
        "no_typing_detected": "Code was submitted but no typing activity was recorded",
        "unnaturally_consistent_timing": "Response timing was unnaturally consistent, suggesting AI assistance",
        "majority_fast_responses": "Most responses were suspiciously fast for the question complexity",
        "frequent_fast_responses": "Multiple responses came faster than typical human processing time",
        "very_low_avg_latency": "Average response time was below natural human threshold",
        "excessive_silence_in_audio": "Extended silence detected during audio responses",
        "audio_energy_spikes": "Sudden audio volume changes detected, possible device switching",
    }

    flag_details = [flag_descriptions.get(f, f) for f in flags]
    if not flag_details:
        assessment = "No suspicious behavior detected. Candidate appears to have completed the interview independently."
    else:
        assessment = f"Detected {len(flag_details)} behavioral flag(s): {'; '.join(flag_details)}."

    return IntegrityAssessment(
        integrity_score=round(score, 1),
        risk_level=risk_level,
        flags=flags,
        summary=assessment,
        details=summary,
    )
