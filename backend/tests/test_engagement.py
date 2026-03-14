"""Tests for engagement analyzer and engagement endpoint."""

import uuid

import pytest
from sqlalchemy import select

from interviewbot.services.engagement_analyzer import (
    compute_engagement_profile,
    compute_message_metrics,
)

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


# --- Unit tests for engagement_analyzer ---


def test_compute_message_metrics_basic():
    """Basic message metrics: word count, elaboration depth."""
    m = compute_message_metrics("Hello world. This is a test.")
    assert m["word_count"] == 6
    assert m["elaboration_depth"] == 2
    assert m["response_latency_ms"] is None


def test_compute_message_metrics_with_latency():
    """WPM is computed when latency is provided."""
    m = compute_message_metrics("One two three four five.", response_latency_ms=60000)
    assert m["response_latency_ms"] == 60000
    assert m["word_count"] == 5
    assert m["words_per_minute"] == 5.0


def test_compute_message_metrics_hedging_detection():
    """Hedging phrases increase hedging_score."""
    m = compute_message_metrics("I think maybe it could be sort of possible.")
    assert m["hedging_score"] > 0


def test_compute_message_metrics_assertiveness_detection():
    """Assertive phrases increase assertiveness_score."""
    m = compute_message_metrics("I built the system. I led the team. I delivered results.")
    assert m["assertiveness_score"] > 0


def test_compute_message_metrics_empty_string():
    """Empty content yields zeros."""
    m = compute_message_metrics("")
    assert m["word_count"] == 0
    assert m["elaboration_depth"] == 0
    assert m["hedging_score"] == 0
    assert m["assertiveness_score"] == 0


def test_compute_engagement_profile_empty():
    """Empty messages yield default profile."""
    p = compute_engagement_profile([])
    assert p["overall_engagement"] == 0
    assert p["response_speed"] == {}
    assert p["confidence_pattern"] == {}
    assert p["elaboration_trend"] == {}
    assert p["notable_signals"] == []


def test_compute_engagement_profile_aggregation():
    """Profile aggregates per-message metrics correctly."""
    messages = [
        {
            "response_latency_ms": 10000,
            "hedging_score": 0.2,
            "assertiveness_score": 0.5,
            "elaboration_depth": 3,
            "question_engagement": 0.7,
        },
        {
            "response_latency_ms": 15000,
            "hedging_score": 0.1,
            "assertiveness_score": 0.6,
            "elaboration_depth": 4,
            "question_engagement": 0.8,
        },
    ]
    p = compute_engagement_profile(messages)
    assert p["overall_engagement"] == 0.75
    assert "response_speed" in p
    assert p["response_speed"]["avg_ms"] == 12500
    assert "confidence_pattern" in p
    assert len(p["confidence_pattern"]["arc"]) == 2
    assert "elaboration_trend" in p
    assert p["elaboration_trend"]["avg_depth"] == 3.5
    assert "per_question" in p["response_speed"]
    assert len(p["response_speed"]["per_question"]) == 2


def test_compute_engagement_profile_notable_signals():
    """Notable signals are generated for high hedging, assertiveness, long pause."""
    messages = [
        {"hedging_score": 0.6, "assertiveness_score": 0.1, "elaboration_depth": 1, "response_latency_ms": 35000},
        {"hedging_score": 0.1, "assertiveness_score": 0.7, "elaboration_depth": 2, "response_latency_ms": 5000},
    ]
    p = compute_engagement_profile(messages)
    assert len(p["notable_signals"]) > 0
    types = {s["type"] for s in p["notable_signals"]}
    assert "hesitation_cluster" in types or "confidence_spike" in types or "long_pause" in types


# --- API tests for engagement endpoint ---


@pytest.mark.asyncio
async def test_get_engagement_success(client, db):
    """Engagement endpoint returns profile when report exists."""
    from interviewbot.models.tables import CandidateReport, InterviewMessage, InterviewSession
    from sqlalchemy import update

    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "engagement2@test.com",
            "org_name": "Engagement Corp 2",
        },
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    job = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    assert job.status_code == 201
    job_id = job.json()["id"]

    link = await client.post(
        f"/api/v1/job-postings/{job_id}/generate-link",
        headers=headers,
    )
    assert link.status_code == 200
    token = link.json()["token"]

    await client.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "Eve", "candidate_email": "eve@test.com"},
    )

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one()

    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == session.id)
        .values(status="completed", overall_score=7.5)
    )
    db.add(
        InterviewMessage(
            session_id=session.id,
            role="interviewer",
            content="Tell me about your experience.",
        )
    )
    db.add(
        InterviewMessage(
            session_id=session.id,
            role="candidate",
            content="I built several systems.",
        )
    )
    report = CandidateReport(
        session_id=session.id,
        ai_summary="Strong candidate.",
        recommendation="hire",
        strengths=[],
        concerns=[],
        confidence_score=0.85,
        engagement_profile={
            "overall_engagement": 0.72,
            "response_speed": {"avg_ms": 12000, "trend": "stable", "consistency": 0.8},
            "confidence_pattern": {"avg": 0.7, "arc": [{"q": 1, "v": 0.7}]},
            "elaboration_trend": {"avg_depth": 3.0, "trend": "stable"},
            "notable_signals": [],
        },
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    report_id = report.id

    resp = await client.get(
        f"/api/v1/reports/{report_id}/engagement",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "engagement_profile" in data
    assert data["engagement_profile"]["overall_engagement"] == 0.72
    assert data["engagement_profile"]["response_speed"]["avg_ms"] == 12000


@pytest.mark.asyncio
async def test_get_engagement_404(client, admin_headers):
    """Engagement endpoint returns 404 for non-existent report."""
    fake_id = str(uuid.uuid4())
    resp = await client.get(
        f"/api/v1/reports/{fake_id}/engagement",
        headers=admin_headers,
    )
    assert resp.status_code == 404
