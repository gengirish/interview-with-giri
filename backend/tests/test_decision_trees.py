"""Tests for decision tree engine and API."""

import uuid

import pytest
from sqlalchemy import select

from interviewbot.models.tables import (
    InterviewDecisionTree,
    InterviewSession,
    JobPosting,
    Organization,
    User,
)
from interviewbot.services.tree_engine import (
    advance_tree,
    compute_path_analytics,
    evaluate_branch,
    get_current_node_config,
    initialize_tree_state,
    validate_tree,
)
from tests.conftest import DEMO_ORG_ID, JOB_PAYLOAD, SIGNUP_PAYLOAD


# --- Tree engine unit tests ---


def test_validate_tree_valid():
    """Valid tree with entry, question block, exit passes validation."""
    tree = {
        "nodes": [
            {"id": "entry", "type": "entry", "next": "q1", "branches": []},
            {"id": "q1", "type": "question_block", "next": "exit", "branches": []},
            {"id": "exit", "type": "exit", "next": None, "branches": []},
        ]
    }
    result = validate_tree(tree)
    assert result["valid"] is True
    assert result["errors"] == []


def test_validate_tree_no_nodes():
    """Empty tree fails validation."""
    result = validate_tree({"nodes": []})
    assert result["valid"] is False
    assert "no nodes" in result["errors"][0].lower()


def test_validate_tree_no_entry():
    """Tree without entry node fails."""
    tree = {
        "nodes": [
            {"id": "q1", "type": "question_block", "next": "exit", "branches": []},
            {"id": "exit", "type": "exit", "next": None, "branches": []},
        ]
    }
    result = validate_tree(tree)
    assert result["valid"] is False
    assert "entry" in result["errors"][0].lower()


def test_validate_tree_no_exit():
    """Tree without exit node fails."""
    tree = {
        "nodes": [
            {"id": "entry", "type": "entry", "next": "q1", "branches": []},
            {"id": "q1", "type": "question_block", "next": "q1", "branches": []},
        ]
    }
    result = validate_tree(tree)
    assert result["valid"] is False
    assert "exit" in result["errors"][0].lower()


def test_validate_tree_unreachable_nodes():
    """Unreachable nodes fail validation."""
    tree = {
        "nodes": [
            {"id": "entry", "type": "entry", "next": "exit", "branches": []},
            {"id": "orphan", "type": "question_block", "next": "exit", "branches": []},
            {"id": "exit", "type": "exit", "next": None, "branches": []},
        ]
    }
    result = validate_tree(tree)
    assert result["valid"] is False
    assert "orphan" in result["errors"][0].lower() or "unreachable" in result["errors"][0].lower()


def test_validate_tree_invalid_reference():
    """Node referencing non-existent node fails."""
    tree = {
        "nodes": [
            {"id": "entry", "type": "entry", "next": "missing", "branches": []},
            {"id": "exit", "type": "exit", "next": None, "branches": []},
        ]
    }
    result = validate_tree(tree)
    assert result["valid"] is False


def test_evaluate_branch_always():
    """Always condition returns next node."""
    branches = [{"condition": "always", "next": "node_b"}]
    assert evaluate_branch(branches, 5.0) == "node_b"


def test_evaluate_branch_score_ge():
    """Score >= threshold matches."""
    branches = [
        {"condition": "score >= 8", "next": "high"},
        {"condition": "always", "next": "low"},
    ]
    assert evaluate_branch(branches, 8.5) == "high"
    assert evaluate_branch(branches, 8.0) == "high"
    assert evaluate_branch(branches, 7.0) == "low"


def test_evaluate_branch_score_le():
    """Score <= threshold matches."""
    branches = [
        {"condition": "score <= 4", "next": "low"},
        {"condition": "always", "next": "high"},
    ]
    assert evaluate_branch(branches, 3.0) == "low"
    assert evaluate_branch(branches, 4.0) == "low"
    assert evaluate_branch(branches, 5.0) == "high"


def test_evaluate_branch_score_gt_lt():
    """Score > and < operators work."""
    branches = [
        {"condition": "score > 7", "next": "pass"},
        {"condition": "score < 5", "next": "fail"},
        {"condition": "always", "next": "mid"},
    ]
    assert evaluate_branch(branches, 8.0) == "pass"
    assert evaluate_branch(branches, 4.0) == "fail"
    assert evaluate_branch(branches, 6.0) == "mid"


def test_initialize_tree_state():
    """State initializes with first node from entry."""
    tree = {
        "nodes": [
            {"id": "entry", "type": "entry", "next": "q1", "branches": []},
            {"id": "q1", "type": "question_block", "config": {"topic": "Python"}, "branches": []},
            {"id": "exit", "type": "exit", "branches": []},
        ]
    }
    state = initialize_tree_state(tree)
    assert state["current_node"] == "q1"
    assert state["path_taken"] == ["start"]
    assert state["node_scores"] == {}
    assert state["questions_asked"] == 0


def test_advance_tree():
    """Advance moves to next node based on score."""
    tree = {
        "nodes": [
            {"id": "entry", "type": "entry", "next": "q1", "branches": []},
            {
                "id": "q1",
                "type": "question_block",
                "branches": [
                    {"condition": "score >= 8", "next": "exit_high"},
                    {"condition": "always", "next": "exit_low"},
                ],
            },
            {"id": "exit_high", "type": "exit", "branches": []},
            {"id": "exit_low", "type": "exit", "branches": []},
        ]
    }
    state = initialize_tree_state(tree)
    state = advance_tree(tree, state, 8.5)
    assert state["current_node"] == "exit_high"
    assert state["node_scores"]["q1"] == 8.5
    assert "q1" in state["path_taken"]


def test_get_current_node_config():
    """Returns config for current question_block node."""
    tree = {
        "nodes": [
            {"id": "q1", "type": "question_block", "config": {"topic": "Python", "num_questions": 5}},
            {"id": "exit", "type": "exit", "config": {}},
        ]
    }
    state = {"current_node": "q1", "path_taken": [], "node_scores": {}}
    config = get_current_node_config(tree, state)
    assert config == {"topic": "Python", "num_questions": 5}


def test_compute_path_analytics():
    """Path analytics aggregates session paths."""
    states = [
        {"path_taken": ["start", "q1", "exit"]},
        {"path_taken": ["start", "q1", "exit"]},
        {"path_taken": ["start", "q1", "q2", "exit"]},
    ]
    result = compute_path_analytics(states, {})
    assert result["total_sessions"] == 3
    assert len(result["paths"]) == 2
    top = result["paths"][0]
    assert "start -> q1 -> exit" in top["path"] or top["path"] == "start -> q1 -> exit"
    assert top["count"] == 2
    assert top["percentage"] == 66.7


# --- API tests ---


async def _setup_org_and_headers(client):
    """Signup and return (org_id, headers)."""
    signup = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    assert signup.status_code == 201
    org_id = signup.json()["org_id"]
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
    return org_id, headers


@pytest.mark.asyncio
async def test_list_decision_trees_empty(client):
    """List returns empty when no trees."""
    _, headers = await _setup_org_and_headers(client)
    resp = await client.get("/api/v1/decision-trees", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_decision_tree(client):
    """Create tree returns 201 and tree data."""
    _, headers = await _setup_org_and_headers(client)
    payload = {
        "name": "Technical Flow",
        "description": "For technical roles",
        "role_type": "technical",
        "tree_data": {"nodes": []},
    }
    resp = await client.post("/api/v1/decision-trees", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Technical Flow"
    assert data["description"] == "For technical roles"
    assert data["role_type"] == "technical"
    assert data["is_published"] is False
    assert data["usage_count"] == 0
    assert "id" in data


@pytest.mark.asyncio
async def test_get_decision_tree(client):
    """Get tree by ID."""
    _, headers = await _setup_org_and_headers(client)
    create = await client.post(
        "/api/v1/decision-trees",
        json={"name": "My Tree", "tree_data": {"nodes": []}},
        headers=headers,
    )
    tree_id = create.json()["id"]
    resp = await client.get(f"/api/v1/decision-trees/{tree_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == tree_id
    assert resp.json()["name"] == "My Tree"


@pytest.mark.asyncio
async def test_update_decision_tree(client):
    """Update tree."""
    _, headers = await _setup_org_and_headers(client)
    create = await client.post(
        "/api/v1/decision-trees",
        json={"name": "Original", "tree_data": {}},
        headers=headers,
    )
    tree_id = create.json()["id"]
    resp = await client.put(
        f"/api/v1/decision-trees/{tree_id}",
        json={"name": "Updated", "tree_data": {"nodes": [{"id": "e", "type": "entry"}]}},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"
    assert "nodes" in resp.json()["tree_data"]


@pytest.mark.asyncio
async def test_delete_decision_tree(client):
    """Delete tree returns 204."""
    _, headers = await _setup_org_and_headers(client)
    create = await client.post(
        "/api/v1/decision-trees",
        json={"name": "To Delete", "tree_data": {}},
        headers=headers,
    )
    tree_id = create.json()["id"]
    resp = await client.delete(f"/api/v1/decision-trees/{tree_id}", headers=headers)
    assert resp.status_code == 204
    get_resp = await client.get(f"/api/v1/decision-trees/{tree_id}", headers=headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_publish_decision_tree(client):
    """Publish toggles is_published."""
    _, headers = await _setup_org_and_headers(client)
    create = await client.post(
        "/api/v1/decision-trees",
        json={"name": "Tree", "tree_data": {}},
        headers=headers,
    )
    tree_id = create.json()["id"]
    resp = await client.post(f"/api/v1/decision-trees/{tree_id}/publish", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_published"] is True
    resp2 = await client.post(f"/api/v1/decision-trees/{tree_id}/publish", headers=headers)
    assert resp2.json()["is_published"] is False


@pytest.mark.asyncio
async def test_duplicate_decision_tree(client):
    """Duplicate creates copy with (Copy) suffix."""
    _, headers = await _setup_org_and_headers(client)
    create = await client.post(
        "/api/v1/decision-trees",
        json={"name": "Original", "tree_data": {"nodes": []}},
        headers=headers,
    )
    tree_id = create.json()["id"]
    resp = await client.post(f"/api/v1/decision-trees/{tree_id}/duplicate", headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] != tree_id
    assert "Copy" in data["name"]
    assert data["is_published"] is False
    assert data["usage_count"] == 0


@pytest.mark.asyncio
async def test_validate_endpoint(client, admin_headers):
    """Validate endpoint returns validation result."""
    valid_tree = {
        "nodes": [
            {"id": "entry", "type": "entry", "next": "exit", "branches": []},
            {"id": "exit", "type": "exit", "branches": []},
        ]
    }
    resp = await client.post(
        "/api/v1/decision-trees/validate",
        json={"tree_data": valid_tree},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "valid" in data
    assert "errors" in data


@pytest.mark.asyncio
async def test_analytics_endpoint(client, db):
    """Analytics returns path counts for sessions using tree."""
    org = Organization(id=uuid.UUID(DEMO_ORG_ID), name="Analytics Org")
    db.add(org)
    user = User(
        id=uuid.uuid4(),
        org_id=org.id,
        email="analytics@test.com",
        password_hash="x",
        full_name="Test",
        role="admin",
    )
    db.add(user)
    tree = InterviewDecisionTree(
        id=uuid.uuid4(),
        org_id=org.id,
        name="Analytics Tree",
        tree_data={"nodes": []},
    )
    db.add(tree)
    job = JobPosting(
        org_id=org.id,
        title="Job",
        role_type="technical",
        job_description="x" * 50,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    session1 = InterviewSession(
        job_posting_id=job.id,
        org_id=org.id,
        token="tok1",
        decision_tree_id=tree.id,
        tree_state={"path_taken": ["start", "q1", "exit"]},
    )
    session2 = InterviewSession(
        job_posting_id=job.id,
        org_id=org.id,
        token="tok2",
        decision_tree_id=tree.id,
        tree_state={"path_taken": ["start", "q1", "exit"]},
    )
    db.add(session1)
    db.add(session2)
    await db.commit()

    from tests.conftest import _make_token

    headers = {"Authorization": f"Bearer {_make_token('admin', str(org.id))}"}
    resp = await client.get(
        f"/api/v1/decision-trees/{tree.id}/analytics",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_sessions"] == 2
    assert len(data["paths"]) >= 1
