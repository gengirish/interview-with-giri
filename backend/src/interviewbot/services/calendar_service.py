"""Calendar service for generating .ics invite files."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import uuid

import structlog

logger = structlog.get_logger()


def generate_ics_invite(
    summary: str,
    description: str,
    start_time: datetime,
    duration_minutes: int = 30,
    organizer_email: str = "noreply@interviewbot.ai",
    attendee_email: str = "",
    location: str = "",
) -> str:
    """Generate an .ics calendar invite string."""
    end_time = start_time + timedelta(minutes=duration_minutes)
    uid = str(uuid.uuid4())
    now = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    start_str = start_time.strftime("%Y%m%dT%H%M%SZ")
    end_str = end_time.strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//InterviewBot//Interview//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{now}",
        f"DTSTART:{start_str}",
        f"DTEND:{end_str}",
        f"SUMMARY:{_escape_ics(summary)}",
        f"DESCRIPTION:{_escape_ics(description)}",
    ]
    if location:
        lines.append(f"LOCATION:{_escape_ics(location)}")
    if organizer_email:
        lines.append(f"ORGANIZER;CN=InterviewBot:mailto:{organizer_email}")
    if attendee_email:
        lines.append(f"ATTENDEE;RSVP=TRUE;ROLE=REQ-PARTICIPANT:mailto:{attendee_email}")
    lines.extend(
        [
            "STATUS:CONFIRMED",
            "BEGIN:VALARM",
            "TRIGGER:-PT15M",
            "ACTION:DISPLAY",
            "DESCRIPTION:Interview in 15 minutes",
            "END:VALARM",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
    )
    return "\r\n".join(lines)


def _escape_ics(text: str) -> str:
    """Escape special characters for iCalendar format."""
    return text.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")
