"""WebSocket tests for text interview flow.

Uses starlette.testclient.TestClient for WebSocket testing (httpx does not support
WebSocket). Requires patching get_session_factory to use the test database and
AIEngine to avoid real LLM calls.
"""

import asyncio
from unittest.mock import AsyncMock, patch

from starlette.testclient import TestClient

from interviewbot.models.tables import InterviewSession, JobPosting, Organization
from tests.conftest import _get_test_session_factory


def _create_session_with_job(
    *,
    token: str,
    status: str = "pending",
    num_questions: int = 10,
) -> str:
    """Create org, job, session in test DB. Returns session token."""

    async def _setup():
        factory = _get_test_session_factory()
        async with factory() as db:
            org = Organization(name="WS Test Org")
            db.add(org)
            await db.flush()

            job = JobPosting(
                org_id=org.id,
                title="Senior Python Developer",
                role_type="technical",
                job_description="We need a Python dev with FastAPI experience.",
                required_skills=["Python", "FastAPI"],
                interview_config={
                    "num_questions": num_questions,
                    "duration_minutes": 20,
                    "difficulty": "medium",
                    "include_coding": False,
                },
            )
            db.add(job)
            await db.flush()

            session = InterviewSession(
                job_posting_id=job.id,
                org_id=org.id,
                token=token,
                status=status,
            )
            db.add(session)
            await db.commit()
        return token

    return asyncio.run(_setup())


def test_ws_invalid_token() -> None:
    """Connect with nonexistent token, expect error message and connection close."""
    from interviewbot.main import create_app

    app = create_app()
    from interviewbot.routers.auth import limiter

    limiter.enabled = False

    factory = _get_test_session_factory()
    with (
        patch("interviewbot.models.database.get_session_factory", return_value=factory),
        TestClient(app) as client,
        client.websocket_connect("/ws/interview/nonexistent-token-xyz") as ws,
    ):
        data = ws.receive_json()
        assert data["type"] == "error"
        assert "Invalid interview token" in data["content"]


def test_ws_completed_session() -> None:
    """Create a session with status=completed, connect, expect error."""
    from interviewbot.main import create_app

    app = create_app()
    from interviewbot.routers.auth import limiter

    limiter.enabled = False

    token = _create_session_with_job(token="completed-session-token", status="completed")
    factory = _get_test_session_factory()
    with (
        patch("interviewbot.models.database.get_session_factory", return_value=factory),
        TestClient(app) as client,
        client.websocket_connect(f"/ws/interview/{token}") as ws,
    ):
        data = ws.receive_json()
        assert data["type"] == "error"
        assert "already been completed" in data["content"]


def test_ws_receives_first_question() -> None:
    """Create valid job+session, mock AIEngine.chat, connect and verify first question."""
    from interviewbot.main import create_app

    app = create_app()
    from interviewbot.routers.auth import limiter

    limiter.enabled = False

    token = _create_session_with_job(token="first-q-token")
    factory = _get_test_session_factory()

    mock_chat = AsyncMock(return_value="Tell me about your experience with FastAPI.")

    with (
        patch("interviewbot.models.database.get_session_factory", return_value=factory),
        patch("interviewbot.websocket.chat_handler.AIEngine") as mock_engine_cls,
    ):
        mock_engine = AsyncMock()
        mock_engine.chat = mock_chat
        mock_engine_cls.return_value = mock_engine
        with TestClient(app) as client, client.websocket_connect(f"/ws/interview/{token}") as ws:
            data = ws.receive_json()
            assert data["type"] == "question"
            assert data["content"] == "Tell me about your experience with FastAPI."
            assert data["progress"] == 1
            assert data["total"] == 10


def test_ws_send_message_get_response() -> None:
    """Send a candidate message, verify AI response comes back."""
    from interviewbot.main import create_app

    app = create_app()
    from interviewbot.routers.auth import limiter

    limiter.enabled = False

    token = _create_session_with_job(token="send-msg-token")
    factory = _get_test_session_factory()

    first_q = "Tell me about your experience with FastAPI."
    follow_up = "That's interesting. How would you handle rate limiting in production?"

    mock_chat = AsyncMock(side_effect=[first_q, follow_up])

    with (
        patch("interviewbot.models.database.get_session_factory", return_value=factory),
        patch("interviewbot.websocket.chat_handler.AIEngine") as mock_engine_cls,
    ):
        mock_engine = AsyncMock()
        mock_engine.chat = mock_chat
        mock_engine_cls.return_value = mock_engine
        with TestClient(app) as client, client.websocket_connect(f"/ws/interview/{token}") as ws:
            # Receive first question
            q1 = ws.receive_json()
            assert q1["type"] == "question"
            assert q1["content"] == first_q

            # Send candidate message
            ws.send_json({"type": "message", "content": "I've used FastAPI for 3 years."})

            # May receive "thinking" first
            msg = ws.receive_json()
            if msg["type"] == "thinking":
                msg = ws.receive_json()

            assert msg["type"] in ("question", "code_review")
            assert msg["content"] == follow_up


def test_ws_interview_ends_after_max_questions() -> None:
    """Configure num_questions=2, verify interview ends after 2 questions."""
    from interviewbot.main import create_app

    app = create_app()
    from interviewbot.routers.auth import limiter

    limiter.enabled = False

    token = _create_session_with_job(
        token="max-questions-token",
        num_questions=2,
    )
    factory = _get_test_session_factory()

    first_q = "What is your experience with Python?"
    end_msg = "Thank you for your time. We'll be in touch."

    mock_chat = AsyncMock(side_effect=[first_q, end_msg])

    with (
        patch("interviewbot.models.database.get_session_factory", return_value=factory),
        patch("interviewbot.websocket.chat_handler.AIEngine") as mock_engine_cls,
    ):
        mock_engine = AsyncMock()
        mock_engine.chat = mock_chat
        mock_engine_cls.return_value = mock_engine
        with TestClient(app) as client, client.websocket_connect(f"/ws/interview/{token}") as ws:
            # First question
            q1 = ws.receive_json()
            assert q1["type"] == "question"
            assert q1["content"] == first_q
            assert q1["progress"] == 1
            assert q1["total"] == 2

            # Send answer
            ws.send_json({"type": "message", "content": "I have 5 years of Python experience."})

            # May receive "thinking"
            msg = ws.receive_json()
            if msg["type"] == "thinking":
                msg = ws.receive_json()

            # Should receive "end" (interview ends after 2nd question)
            assert msg["type"] == "end"
            assert msg["content"] == end_msg
