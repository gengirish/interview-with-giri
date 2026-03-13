"""Tests for job posting bulk import (CSV and XLSX)."""

import csv
import io

import openpyxl
import pytest

from tests.conftest import SIGNUP_PAYLOAD

pytestmark = pytest.mark.smoke


async def _auth_headers(client) -> dict[str, str]:
    resp = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _valid_csv_content() -> str:
    """Valid CSV with 2-3 rows."""
    rows = [
        [
            "title",
            "role_type",
            "job_description",
            "required_skills",
            "interview_format",
            "num_questions",
            "duration_minutes",
            "difficulty",
            "include_coding",
        ],
        [
            "Backend Engineer",
            "technical",
            "We are looking for a backend engineer with 5+ years of Python and FastAPI.",
            "Python, FastAPI, PostgreSQL",
            "text",
            "10",
            "30",
            "medium",
            "false",
        ],
        [
            "Frontend Developer",
            "technical",
            "We need a frontend developer skilled in React, TypeScript, and CSS.",
            "React, TypeScript",
            "text",
            "8",
            "25",
            "medium",
            "false",
        ],
        [
            "Product Manager",
            "non_technical",
            "Seeking an experienced product manager with strong stakeholder communication skills.",
            "Product management, Agile",
            "text",
            "10",
            "30",
            "easy",
            "false",
        ],
    ]
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in rows:
        writer.writerow(row)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_import_csv_valid(client):
    """Create a valid CSV with 2-3 rows, upload it, expect 200 with created count matching."""
    headers = await _auth_headers(client)
    csv_content = _valid_csv_content()
    files = {"file": ("jobs.csv", csv_content.encode("utf-8"), "text/csv")}

    resp = await client.post(
        "/api/v1/job-postings/import",
        files=files,
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_rows"] == 3
    assert data["created"] == 3
    assert data["errors"] == 0
    assert len(data["results"]) == 3
    for r in data["results"]:
        assert r["status"] == "created"


@pytest.mark.asyncio
async def test_import_csv_validation_errors(client):
    """CSV with missing title and too-short description, expect error entries in results."""
    headers = await _auth_headers(client)
    rows = [
        [
            "title",
            "role_type",
            "job_description",
            "required_skills",
            "interview_format",
            "num_questions",
            "duration_minutes",
            "difficulty",
            "include_coding",
        ],
        [
            "",
            "technical",
            "A valid description that is long enough for the schema.",
            "",
            "text",
            "10",
            "30",
            "medium",
            "false",
        ],
        ["Short Desc Job", "technical", "Too short", "", "text", "10", "30", "medium", "false"],
    ]
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in rows:
        writer.writerow(row)
    csv_content = buf.getvalue()
    files = {"file": ("jobs.csv", csv_content.encode("utf-8"), "text/csv")}

    resp = await client.post(
        "/api/v1/job-postings/import",
        files=files,
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_rows"] == 2
    assert data["created"] == 0
    assert data["errors"] == 2
    error_results = [r for r in data["results"] if r["status"] == "error"]
    assert len(error_results) == 2
    errors = [r.get("error", "") for r in error_results]
    assert any("title" in e.lower() or "missing" in e.lower() for e in errors)
    assert any("50" in e or "description" in e.lower() or "length" in e.lower() for e in errors)


@pytest.mark.asyncio
async def test_import_csv_mixed(client):
    """CSV with some valid and some invalid rows, verify partial success."""
    headers = await _auth_headers(client)
    rows = [
        [
            "title",
            "role_type",
            "job_description",
            "required_skills",
            "interview_format",
            "num_questions",
            "duration_minutes",
            "difficulty",
            "include_coding",
        ],
        [
            "Valid Job 1",
            "technical",
            "We need a senior developer with extensive Python and system design experience.",
            "Python, System Design",
            "text",
            "10",
            "30",
            "medium",
            "false",
        ],
        [
            "",
            "technical",
            "Valid description here with enough characters to pass validation.",
            "",
            "text",
            "10",
            "30",
            "medium",
            "false",
        ],
        [
            "Valid Job 2",
            "mixed",
            "Another valid job description that meets the minimum length requirement.",
            "",
            "text",
            "8",
            "25",
            "easy",
            "false",
        ],
    ]
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in rows:
        writer.writerow(row)
    csv_content = buf.getvalue()
    files = {"file": ("jobs.csv", csv_content.encode("utf-8"), "text/csv")}

    resp = await client.post(
        "/api/v1/job-postings/import",
        files=files,
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_rows"] == 3
    assert data["created"] == 2
    assert data["errors"] == 1
    created_results = [r for r in data["results"] if r["status"] == "created"]
    assert len(created_results) == 2
    error_results = [r for r in data["results"] if r["status"] == "error"]
    assert len(error_results) == 1


@pytest.mark.asyncio
async def test_import_xlsx_valid(client):
    """Create an .xlsx file in-memory using openpyxl, upload it, expect success."""
    headers = await _auth_headers(client)
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.append(
        [
            "title",
            "role_type",
            "job_description",
            "required_skills",
            "interview_format",
            "num_questions",
            "duration_minutes",
            "difficulty",
            "include_coding",
        ]
    )
    ws.append(
        [
            "XLSX Backend Role",
            "technical",
            "We are hiring a backend engineer with strong Python and API design skills.",
            "Python, REST APIs",
            "text",
            "10",
            "30",
            "medium",
            "false",
        ]
    )
    ws.append(
        [
            "XLSX Data Engineer",
            "technical",
            "Looking for a data engineer experienced in Spark, SQL, and data pipelines.",
            "Spark, SQL, ETL",
            "text",
            "8",
            "25",
            "hard",
            "true",
        ]
    )
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    files = {
        "file": (
            "jobs.xlsx",
            buf.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    }

    resp = await client.post(
        "/api/v1/job-postings/import",
        files=files,
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_rows"] == 2
    assert data["created"] == 2
    assert data["errors"] == 0


@pytest.mark.asyncio
async def test_import_unsupported_format(client):
    """Upload a .txt file, expect 400."""
    headers = await _auth_headers(client)
    files = {"file": ("data.txt", b"some text content", "text/plain")}

    resp = await client.post(
        "/api/v1/job-postings/import",
        files=files,
        headers=headers,
    )
    assert resp.status_code == 400
    data = resp.json()
    assert (
        "unsupported" in data.get("detail", "").lower()
        or "format" in data.get("detail", "").lower()
    )


@pytest.mark.asyncio
async def test_import_empty_file(client):
    """Upload empty CSV (headers only), expect 400 'no data rows'."""
    headers = await _auth_headers(client)
    csv_content = (
        "title,role_type,job_description,required_skills,"
        "interview_format,num_questions,duration_minutes,"
        "difficulty,include_coding\n"
    )
    files = {"file": ("empty.csv", csv_content.encode("utf-8"), "text/csv")}

    resp = await client.post(
        "/api/v1/job-postings/import",
        files=files,
        headers=headers,
    )
    assert resp.status_code == 400
    data = resp.json()
    assert (
        "no data" in data.get("detail", "").lower()
        or "no data rows" in data.get("detail", "").lower()
    )


@pytest.mark.asyncio
async def test_import_auth_required(client):
    """Upload without auth token, expect 401."""
    csv_content = _valid_csv_content()
    files = {"file": ("jobs.csv", csv_content.encode("utf-8"), "text/csv")}

    resp = await client.post("/api/v1/job-postings/import", files=files)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_import_template_endpoint(client):
    """GET /job-postings/import/template, verify it returns columns list."""
    headers = await _auth_headers(client)

    resp = await client.get("/api/v1/job-postings/import/template", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "columns" in data
    assert isinstance(data["columns"], list)
    assert "title" in data["columns"]
    assert "job_description" in data["columns"]
    assert "sample_row" in data
