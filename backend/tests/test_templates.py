"""Tests for interview templates library."""

import pytest

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD


async def _auth_headers(client):
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.mark.asyncio
async def test_list_templates_seeds_system_templates(client, admin_headers):
    """GET /templates seeds and returns system templates on first access."""
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/templates", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 10
    names = [t["name"] for t in data]
    assert "Senior React Developer" in names
    assert "Backend Python Engineer" in names
    assert "Product Manager" in names
    assert all(t.get("is_system") for t in data[: len(data)])


@pytest.mark.asyncio
async def test_create_custom_template(client, admin_headers):
    """POST /templates creates an org-specific template."""
    headers = await _auth_headers(client)
    payload = {
        "name": "Custom DevOps Template",
        "description": "Our custom DevOps interview",
        "role_type": "technical",
        "job_description_template": "We need DevOps engineers.",
        "required_skills": ["Docker", "K8s"],
        "interview_config": {"num_questions": 8, "duration_minutes": 40},
        "interview_format": "text",
    }
    resp = await client.post("/api/v1/templates", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Custom DevOps Template"
    assert data["is_system"] is False
    assert data["role_type"] == "technical"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_template_from_job(client, admin_headers, db):
    """POST /templates/from-job/{id} creates template from existing job."""
    headers = await _auth_headers(client)
    job_resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=headers)
    job_id = job_resp.json()["id"]

    resp = await client.post(f"/api/v1/templates/from-job/{job_id}", headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert "Template" in data["name"]
    assert data["role_type"] == "technical"
    assert data["is_system"] is False


@pytest.mark.asyncio
async def test_delete_custom_template(client, admin_headers, db):
    """DELETE /templates/{id} deletes an org template."""
    headers = await _auth_headers(client)
    create_resp = await client.post(
        "/api/v1/templates",
        json={
            "name": "To Delete",
            "role_type": "mixed",
            "job_description_template": "Desc",
        },
        headers=headers,
    )
    template_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/templates/{template_id}", headers=headers)
    assert resp.status_code == 204

    list_resp = await client.get("/api/v1/templates", headers=headers)
    ids = [t["id"] for t in list_resp.json()]
    assert template_id not in ids


@pytest.mark.asyncio
async def test_cannot_delete_system_template(client, admin_headers, db):
    """System templates cannot be deleted."""
    headers = await _auth_headers(client)
    list_resp = await client.get("/api/v1/templates", headers=headers)
    templates = list_resp.json()
    system_tpl = next(t for t in templates if t["is_system"])
    template_id = system_tpl["id"]

    resp = await client.delete(f"/api/v1/templates/{template_id}", headers=headers)
    assert resp.status_code == 404
