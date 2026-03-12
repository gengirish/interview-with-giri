"""E2E tests for proctoring and behavior analytics endpoints (Phase 1A + Phase 4A).

Tests cover:
- Single and batch behavior event submission
- Voice timing submission
- Behavior summary retrieval
- Integrity assessment (composite with audio signals)
- RBAC on authenticated endpoints
- Public endpoint access for candidates
"""
import pytest

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD

pytestmark = pytest.mark.smoke

SIGNUP = {**SIGNUP_PAYLOAD, "email": "proctor@testcorp.com"}


async def _setup_interview(client):
    """Create org, job, generate link, start interview. Returns (admin_headers, session_id, token)."""
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP)
    admin_token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {admin_token}"}

    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    link_resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    interview_token = link_resp.json()["token"]

    await client.post(
        f"/api/v1/interviews/public/{interview_token}/start",
        json={"candidate_name": "Proctor Test", "candidate_email": "proctor@test.com"},
    )

    list_resp = await client.get("/api/v1/interviews", headers=headers)
    session_id = list_resp.json()["items"][0]["id"]

    return headers, session_id, interview_token


# ────────────────────────────────────────
#  Single Behavior Event
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_submit_single_behavior_event(client):
    _, _, token = await _setup_interview(client)
    resp = await client.post(
        f"/api/v1/proctoring/events/{token}",
        json={"event_type": "keystroke", "data": {"wpm": 65}},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "recorded"


@pytest.mark.asyncio
async def test_submit_paste_event(client):
    _, _, token = await _setup_interview(client)
    resp = await client.post(
        f"/api/v1/proctoring/events/{token}",
        json={"event_type": "paste", "data": {"content_length": 450}},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_submit_event_invalid_token_returns_404(client):
    resp = await client.post(
        "/api/v1/proctoring/events/nonexistent-token",
        json={"event_type": "keystroke"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_submit_event_invalid_type_returns_422(client):
    _, _, token = await _setup_interview(client)
    resp = await client.post(
        f"/api/v1/proctoring/events/{token}",
        json={"event_type": "invalid_type"},
    )
    assert resp.status_code == 422


# ────────────────────────────────────────
#  Batch Events
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_submit_batch_events(client):
    _, _, token = await _setup_interview(client)
    events = [
        {"event_type": "keystroke", "data": {"wpm": 60}},
        {"event_type": "keystroke", "data": {"wpm": 70}},
        {"event_type": "paste", "data": {"content_length": 100}},
        {"event_type": "tab_switch", "data": {"away_duration_ms": 2000}},
    ]
    resp = await client.post(
        f"/api/v1/proctoring/events/{token}/batch",
        json=events,
    )
    assert resp.status_code == 200
    assert resp.json()["count"] == 4


@pytest.mark.asyncio
async def test_submit_empty_batch(client):
    _, _, token = await _setup_interview(client)
    resp = await client.post(
        f"/api/v1/proctoring/events/{token}/batch",
        json=[],
    )
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


# ────────────────────────────────────────
#  Voice Timing
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_submit_voice_timing(client):
    _, _, token = await _setup_interview(client)
    resp = await client.post(
        f"/api/v1/proctoring/voice-timing/{token}",
        json=[1200.0, 1500.0, 1100.0, 1300.0],
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "recorded"
    assert resp.json()["count"] == 4


@pytest.mark.asyncio
async def test_submit_voice_timing_invalid_token_returns_404(client):
    resp = await client.post(
        "/api/v1/proctoring/voice-timing/bad-token",
        json=[1200.0],
    )
    assert resp.status_code == 404


# ────────────────────────────────────────
#  Behavior Summary (authenticated)
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_behavior_summary_empty_session(client):
    headers, session_id, _ = await _setup_interview(client)
    resp = await client.get(f"/api/v1/proctoring/summary/{session_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_keystrokes"] == 0
    assert data["total_pastes"] == 0
    assert data["integrity_score"] == 10.0
    assert data["flags"] == []


@pytest.mark.asyncio
async def test_behavior_summary_with_events(client):
    headers, session_id, token = await _setup_interview(client)

    events = [
        {"event_type": "keystroke", "data": {"wpm": 65}},
        {"event_type": "keystroke", "data": {"wpm": 70}},
        {"event_type": "paste", "data": {"content_length": 100}},
        {"event_type": "tab_switch", "data": {"away_duration_ms": 5000}},
    ]
    await client.post(f"/api/v1/proctoring/events/{token}/batch", json=events)

    resp = await client.get(f"/api/v1/proctoring/summary/{session_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_keystrokes"] == 2
    assert data["total_pastes"] == 1
    assert data["tab_switches"] == 1
    assert data["avg_typing_speed_wpm"] > 0


@pytest.mark.asyncio
async def test_behavior_summary_requires_auth(client):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"/api/v1/proctoring/summary/{fake_id}")
    assert resp.status_code in (401, 403)


# ────────────────────────────────────────
#  Integrity Assessment (composite)
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_integrity_clean_session(client):
    headers, session_id, _ = await _setup_interview(client)
    resp = await client.get(f"/api/v1/proctoring/integrity/{session_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["integrity_score"] == 10.0
    assert data["risk_level"] == "low"
    assert data["flags"] == []
    assert "No suspicious behavior" in data["summary"]


@pytest.mark.asyncio
async def test_integrity_with_suspicious_behavior(client):
    headers, session_id, token = await _setup_interview(client)

    # Submit many paste events to trigger flags
    events = [
        {"event_type": "paste", "data": {"content_length": 300}}
        for _ in range(10)
    ]
    # Also submit code without keystrokes
    events.append({"event_type": "code_submit", "data": {}})
    await client.post(f"/api/v1/proctoring/events/{token}/batch", json=events)

    resp = await client.get(f"/api/v1/proctoring/integrity/{session_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["integrity_score"] < 10.0
    assert len(data["flags"]) > 0
    assert "excessive_pasting" in data["flags"]
    assert "no_typing_detected" in data["flags"]


@pytest.mark.asyncio
async def test_integrity_with_voice_timing_flags(client):
    """Composite integrity should include audio flags when voice timing data exists."""
    headers, session_id, token = await _setup_interview(client)

    # Submit suspiciously fast and consistent voice timings
    await client.post(
        f"/api/v1/proctoring/voice-timing/{token}",
        json=[500.0, 520.0, 510.0, 490.0, 505.0],
    )

    resp = await client.get(f"/api/v1/proctoring/integrity/{session_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["integrity_score"] < 10.0
    audio_flags = {"majority_fast_responses", "very_low_avg_latency", "unnaturally_consistent_timing"}
    assert any(f in data["flags"] for f in audio_flags)


@pytest.mark.asyncio
async def test_integrity_without_voice_data_uses_behavior_only(client):
    """When no voice timing exists, composite should fall back to behavior-only scoring."""
    headers, session_id, token = await _setup_interview(client)

    events = [{"event_type": "keystroke", "data": {"wpm": 60}} for _ in range(5)]
    await client.post(f"/api/v1/proctoring/events/{token}/batch", json=events)

    resp = await client.get(f"/api/v1/proctoring/integrity/{session_id}", headers=headers)
    data = resp.json()
    assert data["integrity_score"] == 10.0
    assert data["risk_level"] == "low"


@pytest.mark.asyncio
async def test_integrity_requires_auth(client):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"/api/v1/proctoring/integrity/{fake_id}")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_integrity_wrong_session_returns_404(client):
    headers, _, _ = await _setup_interview(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"/api/v1/proctoring/integrity/{fake_id}", headers=headers)
    assert resp.status_code == 404
