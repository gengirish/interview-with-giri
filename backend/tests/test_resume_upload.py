"""Tests for resume upload."""

import io
import uuid

import pytest

from interviewbot.models.tables import InterviewSession, JobPosting
from tests.conftest import DEMO_ORG_ID, SIGNUP_PAYLOAD


async def _auth_headers(client):
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _create_pending_session(client, db):
    """Create a pending interview session. Returns token."""
    from interviewbot.models.tables import Organization

    org = Organization(id=uuid.UUID(DEMO_ORG_ID), name="Upload Org")
    db.add(org)
    await db.flush()
    job = JobPosting(
        org_id=org.id,
        title="Upload Job",
        role_type="technical",
        job_description="Job " * 10,
    )
    db.add(job)
    await db.flush()
    session = InterviewSession(
        job_posting_id=job.id,
        org_id=org.id,
        token="upload-test-token",
        status="pending",
    )
    db.add(session)
    await db.commit()
    return "upload-test-token"


@pytest.mark.asyncio
async def test_upload_resume_success(client, db):
    """POST /uploads/resume/{token} accepts PDF and returns metadata."""
    token = await _create_pending_session(client, db)
    content = b"%PDF-1.4 test content"
    response = await client.post(
        f"/api/v1/uploads/resume/{token}",
        files={"file": ("resume.pdf", io.BytesIO(content), "application/pdf")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "filename" in data
    assert "resume_url" in data
    assert data["filename"].endswith(".pdf")


@pytest.mark.asyncio
async def test_upload_resume_rejects_non_pdf(client, db):
    """Non-PDF files are rejected with 400."""
    token = await _create_pending_session(client, db)
    response = await client.post(
        f"/api/v1/uploads/resume/{token}",
        files={"file": ("resume.txt", io.BytesIO(b"plain text"), "text/plain")},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_upload_resume_session_not_found(client):
    """Invalid token returns 404."""
    content = b"%PDF-1.4 test"
    response = await client.post(
        "/api/v1/uploads/resume/invalid-token-xyz",
        files={"file": ("resume.pdf", io.BytesIO(content), "application/pdf")},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_upload_resume_too_large(client, db):
    """Files over 5MB are rejected."""
    token = await _create_pending_session(client, db)
    large_content = b"x" * (5 * 1024 * 1024 + 1)
    response = await client.post(
        f"/api/v1/uploads/resume/{token}",
        files={"file": ("resume.pdf", io.BytesIO(large_content), "application/pdf")},
    )
    assert response.status_code == 400
