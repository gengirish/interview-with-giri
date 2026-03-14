"""Tests for Competency Genome API and engine."""

from unittest.mock import AsyncMock, patch
import uuid

import pytest
from sqlalchemy import select

from interviewbot.models.tables import (
    CandidateReport,
    CompetencyGenome,
    InterviewSession,
    JobPosting,
    Organization,
    RoleGenomeProfile,
    User,
)
from interviewbot.services.genome_engine import (
    compute_match_percentage,
    merge_genomes,
)
from tests.conftest import DEMO_ORG_ID, JOB_PAYLOAD, SIGNUP_PAYLOAD


# --- Unit tests for genome_engine ---


def test_merge_genomes_new_dimension():
    """New dimension is added with single source."""
    existing = {"dimensions": {}, "interview_count": 0}
    new_dims = {"problem_solving": {"score": 8.0, "confidence": 0.9, "evidence": "Good"}}
    result = merge_genomes(existing, new_dims, "sess-1")
    assert "problem_solving" in result["dimensions"]
    assert result["dimensions"]["problem_solving"]["score"] == 8.0
    assert result["interview_count"] == 1


def test_merge_genomes_existing_dimension_averages():
    """Existing dimension gets confidence-weighted average."""
    existing = {
        "dimensions": {
            "communication": {
                "score": 7.0,
                "confidence": 0.8,
                "sources": [{"session_id": "s1", "score": 7.0}],
            }
        },
        "interview_count": 1,
    }
    new_dims = {"communication": {"score": 9.0, "confidence": 0.85, "evidence": "Better"}}
    result = merge_genomes(existing, new_dims, "s2")
    comm = result["dimensions"]["communication"]
    assert 7.0 < comm["score"] < 9.0
    assert len(comm["sources"]) == 2
    assert result["interview_count"] == 2


def test_compute_match_percentage_full_match():
    """Candidate meets or exceeds all ideal scores."""
    genome_data = {
        "dimensions": {
            "problem_solving": {"score": 8},
            "communication": {"score": 8},
        }
    }
    ideal = {
        "problem_solving": {"ideal": 7, "min": 5, "weight": 1.0},
        "communication": {"ideal": 7, "min": 5, "weight": 1.0},
    }
    result = compute_match_percentage(genome_data, ideal)
    assert result["match_percentage"] == 100.0
    assert len(result["gaps"]) == 0


def test_compute_match_percentage_with_gaps():
    """Candidate below min on some dimensions."""
    genome_data = {
        "dimensions": {
            "problem_solving": {"score": 8},
            "communication": {"score": 3},
        }
    }
    ideal = {
        "problem_solving": {"ideal": 7, "min": 5, "weight": 1.0},
        "communication": {"ideal": 7, "min": 5, "weight": 1.0},
    }
    result = compute_match_percentage(genome_data, ideal)
    assert result["match_percentage"] < 100
    assert len(result["gaps"]) == 1
    assert result["gaps"][0]["dimension"] == "communication"
    assert result["gaps"][0]["actual"] == 3
    assert result["gaps"][0]["required"] == 5


def test_compute_match_percentage_missing_dimension():
    """Dimension not in candidate genome counts as gap."""
    genome_data = {"dimensions": {"problem_solving": {"score": 8}}}
    ideal = {
        "problem_solving": {"ideal": 7, "min": 5, "weight": 1.0},
        "communication": {"ideal": 7, "min": 5, "weight": 1.0},
    }
    result = compute_match_percentage(genome_data, ideal)
    assert result["match_percentage"] == 50.0
    assert len(result["gaps"]) == 1
    assert result["gaps"][0]["dimension"] == "communication"
    assert result["gaps"][0]["actual"] is None


# --- API fixtures ---


async def _setup_org_and_genome(client, db):
    """Create org, user, genome. Returns (email, headers)."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "genome@test.com",
            "org_name": "Genome Corp",
        },
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
    org_id = uuid.UUID(signup.json()["org_id"])

    genome = CompetencyGenome(
        org_id=org_id,
        candidate_email="alice@example.com",
        candidate_name="Alice",
        genome_data={
            "dimensions": {
                "problem_solving": {"score": 8.0, "confidence": 0.9, "sources": []},
                "communication": {"score": 7.0, "confidence": 0.8, "sources": []},
            },
            "interview_count": 2,
        },
    )
    db.add(genome)
    await db.commit()
    return "alice@example.com", headers


# --- API tests ---


@pytest.mark.asyncio
async def test_get_candidate_genome(client, db):
    """Get genome by candidate email."""
    email, headers = await _setup_org_and_genome(client, db)

    resp = await client.get(
        f"/api/v1/genome/candidate/{email.replace('@', '%40')}",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["candidate_email"] == email
    assert data["candidate_name"] == "Alice"
    assert "problem_solving" in (data.get("genome_data") or {}).get("dimensions", {})


@pytest.mark.asyncio
async def test_get_genome_404(client, db):
    """Returns 404 for unknown candidate."""
    _, headers = await _setup_org_and_genome(client, db)

    resp = await client.get(
        "/api/v1/genome/candidate/unknown@example.com",
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_candidate_genomes(client, db):
    """List genomes with optional search."""
    _, headers = await _setup_org_and_genome(client, db)

    resp = await client.get("/api/v1/genome/candidates", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert len(data["items"]) >= 1


@pytest.mark.asyncio
async def test_list_genomes_search(client, db):
    """List genomes filtered by search query."""
    _, headers = await _setup_org_and_genome(client, db)

    resp = await client.get(
        "/api/v1/genome/candidates?q=alice",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) >= 1
    assert any("alice" in (i.get("candidate_email") or "").lower() for i in data["items"])


@pytest.mark.asyncio
async def test_compare_genomes(client, db):
    """Compare 2-5 candidate genomes."""
    email, headers = await _setup_org_and_genome(client, db)

    # Add second genome
    org_id = uuid.UUID(
        (await client.get("/api/v1/users/me", headers=headers)).json()["id"]
    )
    # Get org_id from a genome we created
    result = await db.execute(
        select(CompetencyGenome).where(CompetencyGenome.candidate_email == email)
    )
    g = result.scalar_one()
    org_id = g.org_id

    genome2 = CompetencyGenome(
        org_id=org_id,
        candidate_email="bob@example.com",
        candidate_name="Bob",
        genome_data={"dimensions": {}, "interview_count": 1},
    )
    db.add(genome2)
    await db.commit()

    resp = await client.post(
        "/api/v1/genome/compare",
        json={"candidate_emails": [email, "bob@example.com"]},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "candidates" in data
    assert len(data["candidates"]) == 2


@pytest.mark.asyncio
async def test_compare_genomes_too_few(client, db):
    """Compare requires at least 2 emails."""
    _, headers = await _setup_org_and_genome(client, db)

    resp = await client.post(
        "/api/v1/genome/compare",
        json={"candidate_emails": ["alice@example.com"]},
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_role_profile(client, db):
    """Create role genome profile."""
    _, headers = await _setup_org_and_genome(client, db)

    resp = await client.post(
        "/api/v1/genome/role-profiles",
        json={
            "role_type": "technical",
            "title": "Senior Backend Engineer",
            "ideal_genome": {
                "problem_solving": {"ideal": 8, "min": 6, "weight": 1.5},
                "communication": {"ideal": 7, "min": 5, "weight": 1.0},
            },
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["role_type"] == "technical"
    assert data["title"] == "Senior Backend Engineer"


@pytest.mark.asyncio
async def test_create_role_profile_duplicate_conflict(client, db):
    """Creating duplicate role_type returns 409."""
    _, headers = await _setup_org_and_genome(client, db)

    await client.post(
        "/api/v1/genome/role-profiles",
        json={"role_type": "technical", "title": "Engineer", "ideal_genome": {}},
        headers=headers,
    )

    resp = await client.post(
        "/api/v1/genome/role-profiles",
        json={"role_type": "technical", "title": "Another", "ideal_genome": {}},
        headers=headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_list_role_profiles(client, db):
    """List role profiles."""
    _, headers = await _setup_org_and_genome(client, db)

    await client.post(
        "/api/v1/genome/role-profiles",
        json={"role_type": "technical", "title": "Engineer", "ideal_genome": {}},
        headers=headers,
    )

    resp = await client.get("/api/v1/genome/role-profiles", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert len(data["items"]) >= 1


@pytest.mark.asyncio
async def test_get_role_profile(client, db):
    """Get single role profile by ID."""
    _, headers = await _setup_org_and_genome(client, db)

    create = await client.post(
        "/api/v1/genome/role-profiles",
        json={"role_type": "technical", "title": "Engineer", "ideal_genome": {}},
        headers=headers,
    )
    profile_id = create.json()["id"]

    resp = await client.get(
        f"/api/v1/genome/role-profiles/{profile_id}",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == profile_id


@pytest.mark.asyncio
async def test_delete_role_profile(client, db):
    """Delete role profile."""
    _, headers = await _setup_org_and_genome(client, db)

    create = await client.post(
        "/api/v1/genome/role-profiles",
        json={"role_type": "technical", "title": "Engineer", "ideal_genome": {}},
        headers=headers,
    )
    profile_id = create.json()["id"]

    resp = await client.delete(
        f"/api/v1/genome/role-profiles/{profile_id}",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json().get("status") == "deleted"

    get_resp = await client.get(
        f"/api/v1/genome/role-profiles/{profile_id}",
        headers=headers,
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
@patch("interviewbot.routers.genome.extract_genome_from_report", new_callable=AsyncMock)
async def test_rebuild_genome(mock_extract, client, db):
    """Rebuild genome from all interview reports."""
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "email": "rebuild@test.com",
            "org_name": "Rebuild Corp",
        },
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
    org_id = uuid.UUID(signup.json()["org_id"])

    job = await client.post(
        "/api/v1/job-postings",
        json=JOB_PAYLOAD,
        headers=headers,
    )
    assert job.status_code == 201
    job_id = job.json()["id"]

    session = InterviewSession(
        job_posting_id=uuid.UUID(job_id),
        org_id=org_id,
        token="rebuild-token-123",
        candidate_email="candidate@rebuild.com",
        candidate_name="Candidate",
        status="completed",
    )
    db.add(session)
    await db.flush()

    report = CandidateReport(
        session_id=session.id,
        skill_scores={"Python": {"score": 8, "evidence": "Good"}},
        behavioral_scores={"communication": {"score": 7, "evidence": "Clear"}},
        ai_summary="Strong candidate",
        strengths=["Python"],
        concerns=[],
        recommendation="hire",
        confidence_score=0.85,
    )
    db.add(report)
    await db.commit()

    mock_extract.return_value = {
        "problem_solving": {"score": 8.0, "confidence": 0.9, "evidence": "Good"},
        "communication": {"score": 7.0, "confidence": 0.8, "evidence": "Clear"},
    }

    resp = await client.post(
        "/api/v1/genome/rebuild/candidate%40rebuild.com",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["candidate_email"] == "candidate@rebuild.com"
    assert "dimensions" in (data.get("genome_data") or {})
    mock_extract.assert_called_once()


@pytest.mark.asyncio
async def test_rebuild_genome_404_no_interviews(client, db):
    """Rebuild returns 404 when no completed interviews."""
    _, headers = await _setup_org_and_genome(client, db)

    resp = await client.post(
        "/api/v1/genome/rebuild/nonexistent%40example.com",
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_match_genome_to_job(client, db):
    """Match candidate genome against job's role profile."""
    email, headers = await _setup_org_and_genome(client, db)

    job = await client.post(
        "/api/v1/job-postings",
        json=JOB_PAYLOAD,
        headers=headers,
    )
    assert job.status_code == 201
    job_id = job.json()["id"]

    await client.post(
        "/api/v1/genome/role-profiles",
        json={
            "role_type": "technical",
            "title": "Senior Engineer",
            "ideal_genome": {
                "problem_solving": {"ideal": 7, "min": 5, "weight": 1.0},
                "communication": {"ideal": 7, "min": 5, "weight": 1.0},
            },
        },
        headers=headers,
    )

    resp = await client.post(
        f"/api/v1/genome/match/{job_id}",
        json={"candidate_email": email},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "match_percentage" in data
    assert "gaps" in data
    assert "overqualified" in data
    assert data["candidate_email"] == email
