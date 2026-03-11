"""E2E tests for Role-Based Access Control (RBAC).

Tests that admin, hiring_manager, and viewer roles have correct
permissions across all protected endpoints.
"""
import pytest

from tests.conftest import JOB_PAYLOAD


ADMIN_SIGNUP = {
    "org_name": "RBAC Test Corp",
    "full_name": "Admin User",
    "email": "rbac-admin@test.com",
    "password": "password123",
}

INVITE_HM = {
    "email": "hm@test.com",
    "full_name": "Hiring Manager",
    "role": "hiring_manager",
    "password": "password123",
}

INVITE_VIEWER = {
    "email": "viewer@test.com",
    "full_name": "Viewer User",
    "role": "viewer",
    "password": "password123",
}


async def _setup_org_with_roles(client):
    """Create an org with admin, hiring_manager, and viewer users.
    Returns (admin_headers, hm_headers, viewer_headers).
    """
    signup_resp = await client.post("/api/v1/auth/signup", json=ADMIN_SIGNUP)
    assert signup_resp.status_code == 201
    admin_token = signup_resp.json()["access_token"]
    admin_h = {"Authorization": f"Bearer {admin_token}"}

    invite_resp = await client.post("/api/v1/users", json=INVITE_HM, headers=admin_h)
    assert invite_resp.status_code == 201

    login_hm = await client.post(
        "/api/v1/auth/login",
        json={"email": INVITE_HM["email"], "password": INVITE_HM["password"]},
    )
    assert login_hm.status_code == 200
    hm_h = {"Authorization": f"Bearer {login_hm.json()['access_token']}"}

    invite_resp2 = await client.post("/api/v1/users", json=INVITE_VIEWER, headers=admin_h)
    assert invite_resp2.status_code == 201

    login_v = await client.post(
        "/api/v1/auth/login",
        json={"email": INVITE_VIEWER["email"], "password": INVITE_VIEWER["password"]},
    )
    assert login_v.status_code == 200
    viewer_h = {"Authorization": f"Bearer {login_v.json()['access_token']}"}

    return admin_h, hm_h, viewer_h


# ────────────────────────────────────────
#  User Management (admin-only)
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_can_list_users(client):
    admin_h, _, _ = await _setup_org_with_roles(client)
    resp = await client.get("/api/v1/users", headers=admin_h)
    assert resp.status_code == 200
    assert len(resp.json()) == 3


@pytest.mark.asyncio
async def test_hiring_manager_cannot_list_users(client):
    _, hm_h, _ = await _setup_org_with_roles(client)
    resp = await client.get("/api/v1/users", headers=hm_h)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_list_users(client):
    _, _, viewer_h = await _setup_org_with_roles(client)
    resp = await client.get("/api/v1/users", headers=viewer_h)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_hiring_manager_cannot_invite_user(client):
    _, hm_h, _ = await _setup_org_with_roles(client)
    resp = await client.post(
        "/api/v1/users",
        json={"email": "x@test.com", "full_name": "X", "role": "viewer", "password": "password123"},
        headers=hm_h,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_invite_user(client):
    _, _, viewer_h = await _setup_org_with_roles(client)
    resp = await client.post(
        "/api/v1/users",
        json={"email": "x@test.com", "full_name": "X", "role": "viewer", "password": "password123"},
        headers=viewer_h,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_change_user_role(client):
    admin_h, _, _ = await _setup_org_with_roles(client)
    users = (await client.get("/api/v1/users", headers=admin_h)).json()
    hm_user = next(u for u in users if u["role"] == "hiring_manager")

    resp = await client.patch(
        f"/api/v1/users/{hm_user['id']}/role",
        json={"role": "viewer"},
        headers=admin_h,
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "viewer"


@pytest.mark.asyncio
async def test_admin_cannot_change_own_role(client):
    admin_h, _, _ = await _setup_org_with_roles(client)
    me = (await client.get("/api/v1/users/me", headers=admin_h)).json()

    resp = await client.patch(
        f"/api/v1/users/{me['id']}/role",
        json={"role": "viewer"},
        headers=admin_h,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_admin_can_deactivate_user(client):
    admin_h, _, _ = await _setup_org_with_roles(client)
    users = (await client.get("/api/v1/users", headers=admin_h)).json()
    viewer_user = next(u for u in users if u["role"] == "viewer")

    resp = await client.patch(
        f"/api/v1/users/{viewer_user['id']}/deactivate", headers=admin_h
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_deactivated_user_cannot_login(client):
    admin_h, _, _ = await _setup_org_with_roles(client)
    users = (await client.get("/api/v1/users", headers=admin_h)).json()
    viewer_user = next(u for u in users if u["role"] == "viewer")

    await client.patch(f"/api/v1/users/{viewer_user['id']}/deactivate", headers=admin_h)

    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": INVITE_VIEWER["email"], "password": INVITE_VIEWER["password"]},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_all_roles_can_get_own_profile(client):
    admin_h, hm_h, viewer_h = await _setup_org_with_roles(client)

    for headers, expected_role in [
        (admin_h, "admin"),
        (hm_h, "hiring_manager"),
        (viewer_h, "viewer"),
    ]:
        resp = await client.get("/api/v1/users/me", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["role"] == expected_role


# ────────────────────────────────────────
#  Job Postings — role-based access
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_can_create_job(client):
    admin_h, _, _ = await _setup_org_with_roles(client)
    resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=admin_h)
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_hiring_manager_can_create_job(client):
    _, hm_h, _ = await _setup_org_with_roles(client)
    resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=hm_h)
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_viewer_cannot_create_job(client):
    _, _, viewer_h = await _setup_org_with_roles(client)
    resp = await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=viewer_h)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_all_roles_can_list_jobs(client):
    admin_h, hm_h, viewer_h = await _setup_org_with_roles(client)
    await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=admin_h)

    for headers in [admin_h, hm_h, viewer_h]:
        resp = await client.get("/api/v1/job-postings", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_viewer_cannot_update_job(client):
    admin_h, _, viewer_h = await _setup_org_with_roles(client)
    job = (await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=admin_h)).json()

    resp = await client.patch(
        f"/api/v1/job-postings/{job['id']}",
        json={"title": "Hacked Title"},
        headers=viewer_h,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_hiring_manager_can_update_job(client):
    admin_h, hm_h, _ = await _setup_org_with_roles(client)
    job = (await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=admin_h)).json()

    resp = await client.patch(
        f"/api/v1/job-postings/{job['id']}",
        json={"title": "Updated by HM"},
        headers=hm_h,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated by HM"


@pytest.mark.asyncio
async def test_only_admin_can_delete_job(client):
    admin_h, hm_h, viewer_h = await _setup_org_with_roles(client)
    job = (await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=admin_h)).json()

    resp_viewer = await client.delete(f"/api/v1/job-postings/{job['id']}", headers=viewer_h)
    assert resp_viewer.status_code == 403

    resp_hm = await client.delete(f"/api/v1/job-postings/{job['id']}", headers=hm_h)
    assert resp_hm.status_code == 403

    resp_admin = await client.delete(f"/api/v1/job-postings/{job['id']}", headers=admin_h)
    assert resp_admin.status_code == 204


@pytest.mark.asyncio
async def test_viewer_cannot_generate_interview_link(client):
    admin_h, _, viewer_h = await _setup_org_with_roles(client)
    job = (await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=admin_h)).json()

    resp = await client.post(
        f"/api/v1/job-postings/{job['id']}/generate-link", headers=viewer_h
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_hiring_manager_can_generate_interview_link(client):
    admin_h, hm_h, _ = await _setup_org_with_roles(client)
    job = (await client.post("/api/v1/job-postings", json=JOB_PAYLOAD, headers=admin_h)).json()

    resp = await client.post(
        f"/api/v1/job-postings/{job['id']}/generate-link", headers=hm_h
    )
    assert resp.status_code == 200
    assert "token" in resp.json()


# ────────────────────────────────────────
#  Interviews — role-based access
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_all_roles_can_list_interviews(client):
    admin_h, hm_h, viewer_h = await _setup_org_with_roles(client)

    for headers in [admin_h, hm_h, viewer_h]:
        resp = await client.get("/api/v1/interviews", headers=headers)
        assert resp.status_code == 200


# ────────────────────────────────────────
#  Dashboard & Analytics — all roles
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_all_roles_can_view_dashboard(client):
    admin_h, hm_h, viewer_h = await _setup_org_with_roles(client)

    for headers in [admin_h, hm_h, viewer_h]:
        resp = await client.get("/api/v1/dashboard/stats", headers=headers)
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_all_roles_can_view_analytics_overview(client):
    admin_h, hm_h, viewer_h = await _setup_org_with_roles(client)

    for headers in [admin_h, hm_h, viewer_h]:
        resp = await client.get("/api/v1/analytics/overview", headers=headers)
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_all_roles_can_view_analytics_per_job(client):
    admin_h, hm_h, viewer_h = await _setup_org_with_roles(client)

    for headers in [admin_h, hm_h, viewer_h]:
        resp = await client.get("/api/v1/analytics/per-job", headers=headers)
        assert resp.status_code == 200


# ────────────────────────────────────────
#  Billing — admin-only for checkout
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_all_roles_can_view_subscription(client):
    admin_h, hm_h, viewer_h = await _setup_org_with_roles(client)

    for headers in [admin_h, hm_h, viewer_h]:
        resp = await client.get("/api/v1/billing/subscription", headers=headers)
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_viewer_cannot_create_checkout(client):
    _, _, viewer_h = await _setup_org_with_roles(client)
    resp = await client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": "starter"},
        headers=viewer_h,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_hiring_manager_cannot_create_checkout(client):
    _, hm_h, _ = await _setup_org_with_roles(client)
    resp = await client.post(
        "/api/v1/billing/checkout",
        json={"plan_id": "starter"},
        headers=hm_h,
    )
    assert resp.status_code == 403


# ────────────────────────────────────────
#  Webhooks — admin-only
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_viewer_cannot_access_webhook_config(client):
    _, _, viewer_h = await _setup_org_with_roles(client)
    resp = await client.get("/api/v1/webhooks/config", headers=viewer_h)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_hiring_manager_cannot_access_webhook_config(client):
    _, hm_h, _ = await _setup_org_with_roles(client)
    resp = await client.get("/api/v1/webhooks/config", headers=hm_h)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_access_webhook_config(client):
    admin_h, _, _ = await _setup_org_with_roles(client)
    resp = await client.get("/api/v1/webhooks/config", headers=admin_h)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_viewer_cannot_set_webhook_config(client):
    _, _, viewer_h = await _setup_org_with_roles(client)
    resp = await client.post(
        "/api/v1/webhooks/config",
        json={"url": "https://example.com/webhook", "events": ["interview.completed"]},
        headers=viewer_h,
    )
    assert resp.status_code == 403


# ────────────────────────────────────────
#  Billing plans (public endpoint)
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_billing_plans_accessible_without_auth(client):
    resp = await client.get("/api/v1/billing/plans")
    assert resp.status_code == 200
    plans = resp.json()
    assert len(plans) >= 3


# ────────────────────────────────────────
#  Duplicate invite prevention
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_invite_duplicate_email_returns_409(client):
    admin_h, _, _ = await _setup_org_with_roles(client)

    resp = await client.post("/api/v1/users", json=INVITE_HM, headers=admin_h)
    assert resp.status_code == 409


# ────────────────────────────────────────
#  Login returns correct role
# ────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_returns_correct_role_for_each_user(client):
    await _setup_org_with_roles(client)

    for email, password, expected_role in [
        (ADMIN_SIGNUP["email"], ADMIN_SIGNUP["password"], "admin"),
        (INVITE_HM["email"], INVITE_HM["password"], "hiring_manager"),
        (INVITE_VIEWER["email"], INVITE_VIEWER["password"], "viewer"),
    ]:
        resp = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": password}
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == expected_role
