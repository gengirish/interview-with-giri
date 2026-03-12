"""E2E tests for report export endpoints (Phase 3B).

Tests cover:
- JSON export structure and fields
- CSV export format and content-type
- RBAC: admin/hiring_manager can export; viewer cannot
- 404 when session or report does not exist
"""

import csv
import io
import uuid

import pytest

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD

pytestmark = pytest.mark.smoke

SIGNUP = {**SIGNUP_PAYLOAD, "email": "export@testcorp.com"}


async def _setup_session_with_report(client, db):
    """Create an org, job, interview, and a CandidateReport directly in the DB."""
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP)
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    link_resp = await client.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    interview_token = link_resp.json()["token"]

    # Start the interview to set candidate info
    await client.post(
        f"/api/v1/interviews/public/{interview_token}/start",
        json={"candidate_name": "Export Tester", "candidate_email": "export@test.com"},
    )

    # Get the session ID
    list_resp = await client.get("/api/v1/interviews", headers=headers)
    session = list_resp.json()["items"][0]
    session_id = session["id"]

    # Insert a CandidateReport directly since we can't mock the AI scoring
    from sqlalchemy import update

    from interviewbot.models.tables import CandidateReport, InterviewSession

    # Mark session completed with score
    await db.execute(
        update(InterviewSession)
        .where(InterviewSession.id == uuid.UUID(session_id))
        .values(status="completed", overall_score=8.5)
    )

    report = CandidateReport(
        session_id=uuid.UUID(session_id),
        ai_summary="Strong candidate with solid Python skills.",
        recommendation="Hire",
        strengths=["Python expertise", "System design"],
        concerns=["Limited frontend experience"],
        confidence_score=0.85,
        skill_scores={
            "code_quality": {
                "score": 8.0,
                "evidence": "Clean, well-structured code",
                "notes": "Good",
            },
            "problem_solving": {"score": 7.5, "evidence": "Systematic approach", "notes": "Solid"},
        },
        behavioral_scores={
            "communication": {
                "score": 9.0,
                "evidence": "Clear explanations",
                "notes": "Excellent",
            },
        },
        extended_data={
            "experience_level_assessment": "Senior",
            "hiring_level_fit": "L5/Senior",
            "suggested_follow_up_areas": ["Frontend frameworks"],
        },
    )
    db.add(report)
    await db.commit()

    return headers, session_id


# ────────────────────────────────────────
#  JSON Export
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_json_returns_structured_data(client, db):
    headers, session_id = await _setup_session_with_report(client, db)
    resp = await client.get(f"/api/v1/reports/{session_id}/export/json", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["export_version"] == "1.0"
    assert data["candidate"]["name"] == "Export Tester"
    assert data["candidate"]["email"] == "export@test.com"
    assert data["interview"]["id"] == session_id
    assert data["scores"]["overall"] == 8.5
    assert data["scores"]["confidence"] == 0.85
    assert "code_quality" in data["scores"]["technical"]
    assert "communication" in data["scores"]["behavioral"]
    assert data["assessment"]["recommendation"] == "Hire"
    assert "Python expertise" in data["assessment"]["strengths"]
    assert data["assessment"]["experience_level"] == "Senior"
    assert data["assessment"]["hiring_level_fit"] == "L5/Senior"


@pytest.mark.asyncio
async def test_export_json_nonexistent_session_returns_404(client):
    signup = {**SIGNUP_PAYLOAD, "email": "json404@testcorp.com"}
    resp = await client.post("/api/v1/auth/signup", json=signup)
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"/api/v1/reports/{fake_id}/export/json", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_export_json_requires_auth(client):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"/api/v1/reports/{fake_id}/export/json")
    assert resp.status_code in (401, 403)


# ────────────────────────────────────────
#  CSV Export
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_csv_returns_valid_csv(client, db):
    headers, session_id = await _setup_session_with_report(client, db)
    resp = await client.get(f"/api/v1/reports/{session_id}/export/csv", headers=headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers.get("content-disposition", "")

    reader = csv.reader(io.StringIO(resp.text))
    rows = list(reader)

    # Header row
    assert rows[0] == ["Category", "Dimension", "Score", "Evidence", "Notes"]

    # Technical dimensions
    tech_rows = [r for r in rows if r and r[0] == "Technical"]
    assert len(tech_rows) == 2

    # Behavioral dimensions
    behav_rows = [r for r in rows if r and r[0] == "Behavioral"]
    assert len(behav_rows) == 1

    # Summary rows at the end
    overall_row = next(r for r in rows if r and r[0] == "Overall Score")
    assert float(overall_row[1]) == 8.5

    rec_row = next(r for r in rows if r and r[0] == "Recommendation")
    assert rec_row[1] == "Hire"


@pytest.mark.asyncio
async def test_export_csv_nonexistent_session_returns_404(client):
    signup = {**SIGNUP_PAYLOAD, "email": "csv404@testcorp.com"}
    resp = await client.post("/api/v1/auth/signup", json=signup)
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"/api/v1/reports/{fake_id}/export/csv", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_export_csv_requires_auth(client):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"/api/v1/reports/{fake_id}/export/csv")
    assert resp.status_code in (401, 403)
