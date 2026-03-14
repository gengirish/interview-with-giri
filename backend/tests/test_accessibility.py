"""Tests for Accessibility API and service."""

import uuid

import pytest
from sqlalchemy import select

from interviewbot.models.tables import InterviewSession, JobPosting, Organization
from interviewbot.services.accessibility_service import (
    format_for_screen_reader,
    get_css_overrides,
    get_scoring_adjustments,
    get_time_multiplier,
)
from tests.conftest import DEMO_ORG_ID, JOB_PAYLOAD, SIGNUP_PAYLOAD, _make_token


# --- Unit tests for accessibility_service ---


def test_get_time_multiplier_no_config():
    """No config returns 1.0."""
    assert get_time_multiplier(None) == 1.0
    assert get_time_multiplier({}) == 1.0


def test_get_time_multiplier_extended_time_default():
    """Extended time without multiplier returns 1.5."""
    config = {"preferences": {"extended_time": True}}
    assert get_time_multiplier(config) == 1.5


def test_get_time_multiplier_extended_time_custom():
    """Extended time with custom multiplier returns it."""
    config = {"preferences": {"extended_time": True, "time_multiplier": 2.0}}
    assert get_time_multiplier(config) == 2.0


def test_get_css_overrides_empty():
    """No preferences returns empty overrides."""
    assert get_css_overrides(None) == {}
    assert get_css_overrides({}) == {}
    assert get_css_overrides({"preferences": {}}) == {}


def test_get_css_overrides_high_contrast():
    """High contrast adds expected CSS vars."""
    config = {"preferences": {"high_contrast": True}}
    overrides = get_css_overrides(config)
    assert "--bg-primary" in overrides
    assert overrides["--bg-primary"] == "#000000"
    assert "--text-primary" in overrides
    assert "--focus-ring" in overrides


def test_get_css_overrides_large_text():
    """Large text adds font size overrides."""
    config = {"preferences": {"large_text": True}}
    overrides = get_css_overrides(config)
    assert "--font-size-base" in overrides
    assert overrides["--font-size-base"] == "20px"


def test_get_css_overrides_dyslexia_font():
    """Dyslexia font adds font-family and spacing."""
    config = {"preferences": {"dyslexia_friendly_font": True}}
    overrides = get_css_overrides(config)
    assert "--font-family" in overrides
    assert "OpenDyslexic" in overrides["--font-family"]
    assert "--line-height" in overrides


def test_get_css_overrides_reduced_motion():
    """Reduced motion adds transition/animation overrides."""
    config = {"preferences": {"reduced_motion": True}}
    overrides = get_css_overrides(config)
    assert "--transition-duration" in overrides
    assert overrides["--transition-duration"] == "0s"


def test_format_for_screen_reader():
    """Question text is formatted with number and total."""
    result = format_for_screen_reader("What is your experience?", 2, 10)
    assert result == "Question 2 of 10: What is your experience?"


def test_get_scoring_adjustments_empty():
    """No accommodations returns empty adjustments."""
    assert get_scoring_adjustments(None) == {}
    assert get_scoring_adjustments({"preferences": {}}) == {}


def test_get_scoring_adjustments_extended_time():
    """Extended time adds ignore_response_time."""
    config = {"preferences": {"extended_time": True}}
    assert get_scoring_adjustments(config) == {"ignore_response_time": True}


def test_get_scoring_adjustments_screen_reader():
    """Screen reader adds ignore_formatting."""
    config = {"preferences": {"screen_reader_optimized": True}}
    assert get_scoring_adjustments(config) == {"ignore_formatting": True}


def test_get_scoring_adjustments_combined():
    """Both accommodations add both adjustments."""
    config = {
        "preferences": {
            "extended_time": True,
            "screen_reader_optimized": True,
        }
    }
    adj = get_scoring_adjustments(config)
    assert adj["ignore_response_time"] is True
    assert adj["ignore_formatting"] is True


# --- API tests ---


@pytest.mark.asyncio
async def test_get_config_public_no_auth(client, db):
    """GET /accessibility/config/{token} works without auth."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={**SIGNUP_PAYLOAD, "email": "acc@test.com", "org_name": "Acc Corp"},
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
        json={"candidate_name": "Alice", "candidate_email": "alice@test.com"},
    )

    # No auth header - public endpoint
    resp = await client.get(f"/api/v1/accessibility/config/{token}")
    assert resp.status_code == 200
    data = resp.json()
    assert "mode" in data
    assert data["mode"] == "standard"
    assert "preferences" in data


@pytest.mark.asyncio
async def test_put_config_public(client, db):
    """PUT /accessibility/config/{token} updates without auth."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={**SIGNUP_PAYLOAD, "email": "acc2@test.com", "org_name": "Acc2 Corp"},
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
        json={"candidate_name": "Bob", "candidate_email": "bob@test.com"},
    )

    config = {
        "mode": "accessible",
        "preferences": {
            "extended_time": True,
            "time_multiplier": 2.0,
            "high_contrast": True,
            "screen_reader_optimized": False,
            "dyslexia_friendly_font": False,
            "large_text": False,
            "reduced_motion": False,
            "keyboard_only_navigation": False,
        },
        "accommodations_notes": "",
    }

    resp = await client.put(
        f"/api/v1/accessibility/config/{token}",
        json=config,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "accessible"
    assert data["preferences"]["extended_time"] is True
    assert data["preferences"]["time_multiplier"] == 2.0

    # Verify persisted
    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one()
    assert session.accessibility_config is not None
    assert session.accessibility_config["mode"] == "accessible"


@pytest.mark.asyncio
async def test_get_css_overrides_public(client, db):
    """GET /accessibility/css-overrides/{token} returns overrides."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={**SIGNUP_PAYLOAD, "email": "acc3@test.com", "org_name": "Acc3 Corp"},
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
        json={"candidate_name": "Carol", "candidate_email": "carol@test.com"},
    )

    # No config - empty overrides
    resp = await client.get(f"/api/v1/accessibility/css-overrides/{token}")
    assert resp.status_code == 200
    assert resp.json() == {}

    # Set high contrast config
    await client.put(
        f"/api/v1/accessibility/config/{token}",
        json={
            "mode": "accessible",
            "preferences": {
                "extended_time": False,
                "time_multiplier": 1.0,
                "high_contrast": True,
                "screen_reader_optimized": False,
                "dyslexia_friendly_font": False,
                "large_text": False,
                "reduced_motion": False,
                "keyboard_only_navigation": False,
            },
            "accommodations_notes": "",
        },
    )

    resp = await client.get(f"/api/v1/accessibility/css-overrides/{token}")
    assert resp.status_code == 200
    overrides = resp.json()
    assert "--bg-primary" in overrides
    assert overrides["--bg-primary"] == "#000000"


@pytest.mark.asyncio
async def test_config_404_invalid_token(client):
    """Config and css-overrides return 404 for invalid token."""
    resp = await client.get("/api/v1/accessibility/config/invalid-token-xyz")
    assert resp.status_code == 404

    resp = await client.get("/api/v1/accessibility/css-overrides/invalid-token-xyz")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_org_settings_requires_auth(client):
    """GET /accessibility/org-settings requires JWT."""
    resp = await client.get("/api/v1/accessibility/org-settings")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_org_settings_get_and_put(client):
    """GET and PUT org settings work for admin."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={**SIGNUP_PAYLOAD, "email": "acc4@test.com", "org_name": "Acc4 Corp"},
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    resp = await client.get("/api/v1/accessibility/org-settings", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "default_mode" in data
    assert data["default_mode"] == "offer_choice"
    assert "allowed_accommodations" in data
    assert "extended_time" in data["allowed_accommodations"]

    resp = await client.put(
        "/api/v1/accessibility/org-settings",
        headers=headers,
        json={
            "default_mode": "always_accessible",
            "allowed_accommodations": ["extended_time", "high_contrast"],
            "custom_instructions": "Please contact us if you need additional support.",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["default_mode"] == "always_accessible"
    assert data["allowed_accommodations"] == ["extended_time", "high_contrast"]
    assert "custom" in data["custom_instructions"]

    resp = await client.get("/api/v1/accessibility/org-settings", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["default_mode"] == "always_accessible"


@pytest.mark.asyncio
async def test_org_settings_put_requires_admin(client):
    """PUT org settings requires admin role."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={**SIGNUP_PAYLOAD, "email": "acc5@test.com", "org_name": "Acc5 Corp"},
    )
    assert signup.status_code == 201
    org_id = signup.json()["org_id"]

    hm_headers = {"Authorization": f"Bearer {_make_token('hiring_manager', org_id)}"}

    resp = await client.put(
        "/api/v1/accessibility/org-settings",
        headers=hm_headers,
        json={
            "default_mode": "always_standard",
            "allowed_accommodations": [],
            "custom_instructions": "",
        },
    )
    assert resp.status_code == 403
