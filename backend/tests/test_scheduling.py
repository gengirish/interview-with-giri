"""Tests for interview scheduling with calendar integration."""

from datetime import UTC, datetime

import pytest

from interviewbot.services.calendar_service import generate_ics_invite
from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _auth_headers(client):
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.mark.asyncio
async def test_generate_link_without_scheduling(client, admin_headers, db):
    """POST generate-link without body still works (backward compat)."""
    headers = await _auth_headers(client)
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "interview_url" in data
    assert "ics_content" not in data


@pytest.mark.asyncio
async def test_generate_link_with_scheduling(client, admin_headers, db):
    """POST generate-link with scheduled_at creates scheduled session."""
    headers = await _auth_headers(client)
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    scheduled_at = "2026-03-15T10:00:00Z"
    resp = await client.post(
        f"/api/v1/job-postings/{job_id}/generate-link",
        json={"scheduled_at": scheduled_at},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert datetime.fromisoformat(data["scheduled_at"]) == datetime.fromisoformat(scheduled_at)


@pytest.mark.asyncio
async def test_generate_link_with_scheduling_returns_ics(client, admin_headers, db):
    """Scheduled link with candidate_email returns ics_content."""
    headers = await _auth_headers(client)
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/job-postings/{job_id}/generate-link",
        json={
            "scheduled_at": "2026-03-15T10:00:00Z",
            "candidate_email": "candidate@example.com",
            "candidate_name": "Jane Doe",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "ics_content" in data
    assert "BEGIN:VCALENDAR" in data["ics_content"]
    assert "BEGIN:VEVENT" in data["ics_content"]


def test_calendar_ics_format():
    """Generated ICS content is valid iCalendar format."""
    ics = generate_ics_invite(
        summary="Test Interview",
        description="Interview for Test Role",
        start_time=datetime(2026, 3, 15, 10, 0, tzinfo=UTC),
        duration_minutes=30,
    )
    assert "BEGIN:VCALENDAR" in ics
    assert "BEGIN:VEVENT" in ics
    assert "Test Interview" in ics
    assert "TRIGGER:-PT15M" in ics
    assert "END:VEVENT" in ics
    assert "END:VCALENDAR" in ics
