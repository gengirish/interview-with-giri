"""Tests for Predictive Hiring Success API and prediction engine."""

from unittest.mock import MagicMock
import uuid

import pytest
from sqlalchemy import select

from interviewbot.models.tables import (
    CandidateReport,
    InterviewSession,
)
from interviewbot.services.prediction_engine import (
    apply_model,
    extract_features,
    heuristic_prediction,
    train_model,
)
from tests.conftest import DEMO_ORG_ID, JOB_PAYLOAD, SIGNUP_PAYLOAD


# --- Unit tests for prediction_engine ---


def test_extract_features_from_report():
    """Extract features from a report object."""
    report = MagicMock()
    report.overall_score = None
    report.skill_scores = {"python": 7.5, "communication": 8}
    report.behavioral_scores = {"leadership": 6}
    report.confidence_score = 0.85
    report.strengths = ["Strong Python"]
    report.concerns = ["Limited leadership"]
    report.recommendation = "hire"

    features = extract_features(report)
    assert features["overall_score"] == 0
    assert features["skill_python"] == 7.5
    assert features["skill_communication"] == 8
    assert features["behavioral_leadership"] == 6
    assert features["confidence_score"] == 0.85
    assert features["strengths_count"] == 1
    assert features["concerns_count"] == 1
    assert features["recommendation_score"] == 0.75


def test_extract_features_with_overall_score():
    """Overall score can come from report or session."""
    report = MagicMock()
    report.overall_score = 8.5
    report.skill_scores = {}
    report.behavioral_scores = {}
    report.confidence_score = 0.9
    report.strengths = []
    report.concerns = []
    report.recommendation = "strong_hire"

    features = extract_features(report, overall_score=8.5)
    assert features["overall_score"] == 8.5
    assert features["recommendation_score"] == 1.0


def test_extract_features_with_engagement_profile():
    """Engagement profile adds engagement_overall, avg_response_ms, avg_confidence."""
    report = MagicMock()
    report.overall_score = 7
    report.skill_scores = {}
    report.behavioral_scores = {}
    report.confidence_score = 0.8
    report.strengths = []
    report.concerns = []
    report.recommendation = "hire"

    engagement = {
        "overall_engagement": 0.75,
        "response_speed": {"avg_ms": 3000},
        "confidence_pattern": {"avg": 0.7},
    }
    features = extract_features(report, engagement_profile=engagement)
    assert features["engagement_overall"] == 0.75
    assert features["avg_response_ms"] == 3000
    assert features["avg_confidence"] == 0.7


def test_heuristic_prediction():
    """Heuristic returns probability, confidence, factors, is_heuristic=True."""
    features = {
        "overall_score": 8,
        "recommendation_score": 0.75,
        "engagement_overall": 0.6,
        "avg_confidence": 0.7,
        "concerns_count": 1,
    }
    result = heuristic_prediction(features)
    assert "success_probability" in result
    assert 0 <= result["success_probability"] <= 1
    assert result["confidence"] == "low"
    assert result["is_heuristic"] is True
    assert "contributing_factors" in result
    assert "risk_factors" in result


def test_heuristic_prediction_low_score_adds_risk():
    """Low overall score adds risk factor."""
    features = {"overall_score": 4, "recommendation_score": 0.25}
    result = heuristic_prediction(features)
    assert any("Low interview score" in str(f) for f in result["risk_factors"])


def test_train_model_insufficient_data():
    """Train returns error when fewer than 10 outcomes."""
    data = [{"features": {"a": 1}, "success": True}] * 5
    result = train_model(data)
    assert "error" in result
    assert "10" in result["error"]


def test_train_model_sufficient_data():
    """Train returns feature_weights and accuracy_metrics."""
    data = []
    for i in range(12):
        success = i < 6
        data.append({
            "features": {"overall_score": 8 if success else 4, "rec": 0.8 if success else 0.3},
            "success": success,
        })
    result = train_model(data)
    assert "error" not in result
    assert "feature_weights" in result
    assert "accuracy_metrics" in result
    assert result["training_sample_size"] == 12
    assert "overall_score" in result["feature_weights"]
    assert result["accuracy_metrics"]["sample_size"] == 12


def test_apply_model():
    """Apply model weights to features returns prediction."""
    features = {"overall_score": 8, "rec": 0.8}
    weights = {"overall_score": 0.5, "rec": 0.3}
    result = apply_model(features, weights)
    assert "success_probability" in result
    assert 0 <= result["success_probability"] <= 1
    assert result["is_heuristic"] is False
    assert "contributing_factors" in result
    assert "risk_factors" in result


# --- API fixtures ---


async def _setup_prediction_fixtures(client, db):
    """Create org, job, completed session with report. Returns (session_id, org_id, headers)."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "pred@test.com",
            "org_name": "Pred Corp",
        },
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
    org_id = signup.json()["org_id"]

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
        json={"candidate_name": "Bob", "candidate_email": "bob@test.com"},
    )

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one()
    session.status = "completed"
    session.overall_score = 7.5
    session.duration_seconds = 600
    db.add(session)

    report = CandidateReport(
        session_id=session.id,
        skill_scores={"python": {"score": 7.5, "evidence": "Good"}},
        behavioral_scores={"communication": {"score": 8, "evidence": "Clear"}},
        ai_summary="Strong candidate",
        strengths=["Python"],
        concerns=[],
        recommendation="hire",
        confidence_score=0.85,
    )
    db.add(report)

    await db.commit()
    await db.refresh(session)
    return str(session.id), org_id, headers


@pytest.mark.asyncio
async def test_record_outcome(client, db):
    """POST /predictions/outcomes records hiring outcome."""
    session_id, org_id, headers = await _setup_prediction_fixtures(client, db)

    resp = await client.post(
        "/api/v1/predictions/outcomes",
        json={
            "session_id": session_id,
            "candidate_email": "bob@test.com",
            "was_hired": True,
            "hire_date": "2025-01-15T00:00:00Z",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == session_id
    assert data["candidate_email"] == "bob@test.com"
    assert data["was_hired"] is True


@pytest.mark.asyncio
async def test_record_outcome_duplicate_409(client, db):
    """POST /predictions/outcomes returns 409 when outcome already exists."""
    session_id, org_id, headers = await _setup_prediction_fixtures(client, db)

    await client.post(
        "/api/v1/predictions/outcomes",
        json={
            "session_id": session_id,
            "candidate_email": "bob@test.com",
            "was_hired": True,
        },
        headers=headers,
    )

    resp = await client.post(
        "/api/v1/predictions/outcomes",
        json={
            "session_id": session_id,
            "candidate_email": "bob@test.com",
            "was_hired": False,
        },
        headers=headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_update_outcome(client, db):
    """PUT /predictions/outcomes/{session_id} updates post-hire feedback."""
    session_id, org_id, headers = await _setup_prediction_fixtures(client, db)

    await client.post(
        "/api/v1/predictions/outcomes",
        json={
            "session_id": session_id,
            "candidate_email": "bob@test.com",
            "was_hired": True,
        },
        headers=headers,
    )

    resp = await client.put(
        f"/api/v1/predictions/outcomes/{session_id}",
        json={
            "performance_rating": 4.2,
            "retention_months": 12,
            "is_still_employed": True,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["performance_rating"] == 4.2
    assert data["retention_months"] == 12
    assert data["is_still_employed"] is True


@pytest.mark.asyncio
async def test_list_outcomes(client, db):
    """GET /predictions/outcomes returns paginated list."""
    session_id, org_id, headers = await _setup_prediction_fixtures(client, db)

    await client.post(
        "/api/v1/predictions/outcomes",
        json={
            "session_id": session_id,
            "candidate_email": "bob@test.com",
            "was_hired": True,
        },
        headers=headers,
    )

    resp = await client.get("/api/v1/predictions/outcomes?page=1&per_page=20", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert len(data["items"]) >= 1
    assert data["items"][0]["candidate_email"] == "bob@test.com"


@pytest.mark.asyncio
async def test_get_outcome_by_session(client, db):
    """GET /predictions/outcomes/by-session/{session_id} returns outcome or 404."""
    session_id, org_id, headers = await _setup_prediction_fixtures(client, db)

    resp = await client.get(f"/api/v1/predictions/outcomes/by-session/{session_id}", headers=headers)
    assert resp.status_code == 404

    await client.post(
        "/api/v1/predictions/outcomes",
        json={
            "session_id": session_id,
            "candidate_email": "bob@test.com",
            "was_hired": True,
        },
        headers=headers,
    )

    resp = await client.get(f"/api/v1/predictions/outcomes/by-session/{session_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["session_id"] == session_id


@pytest.mark.asyncio
async def test_get_prediction(client, db):
    """GET /predictions/predict/{session_id} returns heuristic when no model."""
    session_id, org_id, headers = await _setup_prediction_fixtures(client, db)

    resp = await client.get(f"/api/v1/predictions/predict/{session_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "success_probability" in data
    assert "confidence" in data
    assert "contributing_factors" in data
    assert "risk_factors" in data
    assert data["is_heuristic"] is True


@pytest.mark.asyncio
async def test_get_prediction_no_report_404(client, db):
    """GET /predictions/predict/{session_id} returns 404 when no report."""
    session_id, org_id, headers = await _setup_prediction_fixtures(client, db)

    # Remove report
    result = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == uuid.UUID(session_id))
    )
    report = result.scalar_one_or_none()
    if report:
        db.delete(report)
        await db.commit()

    resp = await client.get(f"/api/v1/predictions/predict/{session_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_train_requires_10_outcomes(client, db):
    """POST /predictions/train returns 400 when fewer than 10 trainable outcomes."""
    session_id, org_id, headers = await _setup_prediction_fixtures(client, db)

    # Record one outcome with performance_rating
    await client.post(
        "/api/v1/predictions/outcomes",
        json={
            "session_id": session_id,
            "candidate_email": "bob@test.com",
            "was_hired": True,
        },
        headers=headers,
    )
    await client.put(
        f"/api/v1/predictions/outcomes/{session_id}",
        json={"performance_rating": 4.5, "retention_months": 6},
        headers=headers,
    )

    resp = await client.post("/api/v1/predictions/train", headers=headers)
    assert resp.status_code == 400
    assert "10" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_get_model_empty(client, db):
    """GET /predictions/model returns null when no active model."""
    session_id, org_id, headers = await _setup_prediction_fixtures(client, db)

    resp = await client.get("/api/v1/predictions/model", headers=headers)
    assert resp.status_code == 200
    assert resp.json() is None


@pytest.mark.asyncio
async def test_get_insights_no_model(client, db):
    """GET /predictions/insights returns empty when no model."""
    session_id, org_id, headers = await _setup_prediction_fixtures(client, db)

    resp = await client.get("/api/v1/predictions/insights", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["feature_importance"] == []
    assert "message" in data


@pytest.mark.asyncio
async def test_train_requires_admin(client, db):
    """POST /predictions/train requires admin role."""
    from tests.conftest import _make_token

    session_id, org_id, headers = await _setup_prediction_fixtures(client, db)
    hm_headers = {"Authorization": f"Bearer {_make_token('hiring_manager', org_id)}"}

    resp = await client.post("/api/v1/predictions/train", headers=hm_headers)
    assert resp.status_code == 403
