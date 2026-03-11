import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from interviewbot.config import get_settings
from interviewbot.models.tables import Base

DEMO_ORG_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"

_test_engine = None


def _get_test_engine():
    global _test_engine
    if _test_engine is None:
        settings = get_settings()
        _test_engine = create_async_engine(settings.database_url, echo=False, pool_size=5)
    return _test_engine


def _get_test_session_factory():
    return async_sessionmaker(
        _get_test_engine(), class_=AsyncSession, expire_on_commit=False
    )


_TRUNCATE_SQL = text(
    "TRUNCATE TABLE candidate_report, interview_message, "
    "interview_session, job_posting, subscription, users, organization "
    "CASCADE"
)


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def setup_database():
    """Create all tables once before the entire test session."""
    engine = _get_test_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(loop_scope="session", autouse=True)
async def _cleanup_after_test():
    """Truncate all tables after each test for isolation."""
    yield
    factory = _get_test_session_factory()
    async with factory() as session:
        await session.execute(_TRUNCATE_SQL)
        await session.commit()


@pytest_asyncio.fixture(loop_scope="session")
async def client() -> AsyncGenerator[AsyncClient, None]:
    """ASGI test client with DB dependency overridden to use test database."""
    from interviewbot.dependencies import get_db
    from interviewbot.main import create_app

    factory = _get_test_session_factory()

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    from interviewbot.routers.auth import limiter
    limiter.enabled = False

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


@pytest_asyncio.fixture(loop_scope="session")
async def db() -> AsyncGenerator[AsyncSession, None]:
    factory = _get_test_session_factory()
    async with factory() as session:
        yield session


def _make_token(
    role: str = "admin",
    org_id: str = DEMO_ORG_ID,
    user_id: str | None = None,
    email: str | None = None,
) -> str:
    settings = get_settings()
    return jwt.encode(
        {
            "sub": user_id or str(uuid.uuid4()),
            "email": email or f"{role}@testcorp.com",
            "role": role,
            "org_id": org_id,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


@pytest.fixture
def admin_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token('admin')}"}


@pytest.fixture
def hiring_manager_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token('hiring_manager')}"}


@pytest.fixture
def viewer_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token('viewer')}"}


# Reusable test data

JOB_PAYLOAD = {
    "title": "Senior Python Developer",
    "role_type": "technical",
    "job_description": (
        "We are looking for a senior Python developer with experience in "
        "FastAPI, PostgreSQL, Docker, and cloud deployment. "
        "The candidate should have 5+ years of building scalable web APIs."
    ),
    "required_skills": ["Python", "FastAPI", "PostgreSQL"],
    "interview_format": "text",
    "interview_config": {
        "num_questions": 5,
        "duration_minutes": 20,
        "difficulty": "medium",
        "include_coding": False,
    },
}

SIGNUP_PAYLOAD = {
    "org_name": "E2E Test Corp",
    "full_name": "Test User",
    "email": "e2e@testcorp.com",
    "password": "securepassword123",
}
