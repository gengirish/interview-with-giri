"""WebSocket tests for text interview flow.

Uses starlette.testclient.TestClient for synchronous WebSocket testing.
Sets up test data via HTTP endpoints, then tests WebSocket behavior.
"""

from unittest.mock import AsyncMock, patch

from starlette.testclient import TestClient

from tests.conftest import JOB_PAYLOAD, SIGNUP_PAYLOAD, _get_test_session_factory


def _make_app():
    """Create app with test DB override and rate limiter disabled."""
    from interviewbot.dependencies import get_db
    from interviewbot.main import create_app
    from interviewbot.routers.auth import limiter

    factory = _get_test_session_factory()

    async def _override_get_db():
        async with factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    limiter.enabled = False
    return app


def _setup_interview(tc: TestClient, num_questions: int = 10) -> str:
    """Create org, job, interview link via HTTP. Returns interview token."""
    signup = {**SIGNUP_PAYLOAD, "email": f"ws-{id(tc)}@test.com"}
    resp = tc.post("/api/v1/auth/signup", json=signup)
    assert resp.status_code == 201
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    job = {
        **JOB_PAYLOAD,
        "interview_config": {
            "num_questions": num_questions,
            "duration_minutes": 20,
            "difficulty": "medium",
            "include_coding": False,
        },
    }
    job_resp = tc.post("/api/v1/job-postings", json=job, headers=headers)
    assert job_resp.status_code == 201
    job_id = job_resp.json()["id"]

    link_resp = tc.post(f"/api/v1/job-postings/{job_id}/generate-link", headers=headers)
    assert link_resp.status_code == 201
    token = link_resp.json()["token"]

    start_resp = tc.post(
        f"/api/v1/interviews/public/{token}/start",
        json={"candidate_name": "WS Tester", "candidate_email": "ws@test.com"},
    )
    assert start_resp.status_code == 200

    return token


def test_ws_invalid_token() -> None:
    """Connect with nonexistent token, expect error message."""
    app = _make_app()
    factory = _get_test_session_factory()

    with (
        patch(
            "interviewbot.models.database.get_session_factory",
            return_value=factory,
        ),
        TestClient(app) as tc,
        tc.websocket_connect("/ws/interview/nonexistent-token-xyz") as ws,
    ):
        data = ws.receive_json()
        assert data["type"] == "error"
        assert "invalid" in data["content"].lower() or "not found" in data["content"].lower()


def test_ws_receives_first_question() -> None:
    """Create valid session, mock AIEngine, verify first question is received."""
    app = _make_app()
    factory = _get_test_session_factory()

    first_q = "Tell me about your experience with FastAPI."
    mock_chat = AsyncMock(return_value=first_q)

    with (
        patch(
            "interviewbot.models.database.get_session_factory",
            return_value=factory,
        ),
        TestClient(app) as tc,
    ):
        token = _setup_interview(tc)

        with (
            patch("interviewbot.websocket.chat_handler.AIEngine") as mock_cls,
        ):
            mock_engine = AsyncMock()
            mock_engine.chat = mock_chat
            mock_cls.return_value = mock_engine

            with tc.websocket_connect(f"/ws/interview/{token}") as ws:
                data = ws.receive_json()
                assert data["type"] == "question"
                assert data["content"] == first_q
                assert data["progress"] == 1


def test_ws_send_message_get_response() -> None:
    """Send a candidate message, verify AI follow-up response."""
    app = _make_app()
    factory = _get_test_session_factory()

    first_q = "What is your Python experience?"
    follow_up = "How do you handle async operations?"
    mock_chat = AsyncMock(side_effect=[first_q, follow_up])

    with (
        patch(
            "interviewbot.models.database.get_session_factory",
            return_value=factory,
        ),
        TestClient(app) as tc,
    ):
        token = _setup_interview(tc)

        with patch("interviewbot.websocket.chat_handler.AIEngine") as mock_cls:
            mock_engine = AsyncMock()
            mock_engine.chat = mock_chat
            mock_cls.return_value = mock_engine

            with tc.websocket_connect(f"/ws/interview/{token}") as ws:
                q1 = ws.receive_json()
                assert q1["type"] == "question"

                ws.send_json(
                    {
                        "type": "message",
                        "content": "I've used Python for 5 years.",
                    }
                )

                msg = ws.receive_json()
                if msg["type"] == "thinking":
                    msg = ws.receive_json()
                assert msg["type"] in ("question", "code_review")
                assert msg["content"] == follow_up


def test_ws_interview_ends_after_max_questions() -> None:
    """With num_questions=2, interview ends after 2 AI responses."""
    app = _make_app()
    factory = _get_test_session_factory()

    first_q = "What is Python?"
    end_msg = "Thank you for your time."
    mock_chat = AsyncMock(side_effect=[first_q, end_msg])

    with (
        patch(
            "interviewbot.models.database.get_session_factory",
            return_value=factory,
        ),
        TestClient(app) as tc,
    ):
        token = _setup_interview(tc, num_questions=2)

        with patch("interviewbot.websocket.chat_handler.AIEngine") as mock_cls:
            mock_engine = AsyncMock()
            mock_engine.chat = mock_chat
            mock_cls.return_value = mock_engine

            with tc.websocket_connect(f"/ws/interview/{token}") as ws:
                q1 = ws.receive_json()
                assert q1["type"] == "question"
                assert q1["progress"] == 1
                assert q1["total"] == 2

                ws.send_json(
                    {
                        "type": "message",
                        "content": "Python is a programming language.",
                    }
                )

                msg = ws.receive_json()
                if msg["type"] == "thinking":
                    msg = ws.receive_json()
                assert msg["type"] == "end"
                assert msg["content"] == end_msg
