from collections.abc import AsyncGenerator
import os
import uuid

from httpx import ASGITransport, AsyncClient
from jose import jwt
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from interviewbot.models.database import _make_connect_args, _strip_sslmode
from interviewbot.models.tables import Base

DEMO_ORG_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
DEFAULT_TEST_DATABASE_URL = "postgresql+asyncpg://postgres:changeme@localhost:5433/interviewbot"

_test_engine = None


def _get_test_engine():
    global _test_engine
    if _test_engine is None:
        test_database_url = (
            os.getenv("TEST_DATABASE_URL")
            or os.getenv("DATABASE_URL")
            or DEFAULT_TEST_DATABASE_URL
        )
        _test_engine = create_async_engine(
            _strip_sslmode(test_database_url),
            echo=False,
            pool_size=5,
            connect_args=_make_connect_args(test_database_url),
        )
    return _test_engine


def _get_test_session_factory():
    return async_sessionmaker(_get_test_engine(), class_=AsyncSession, expire_on_commit=False)


def _truncate_sql() -> text:
    """Build TRUNCATE from model metadata so it stays in sync automatically."""
    table_names = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
    return text(f"TRUNCATE TABLE {table_names} CASCADE")


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def setup_database():
    """Create all tables once before the entire test session."""
    engine = _get_test_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    # Verify at least one table was actually created (catches pooler DDL issues)
    async with engine.connect() as conn:
        result = await conn.execute(
            text("SELECT count(*) FROM information_schema.tables WHERE table_name = 'users'")
        )
        if result.scalar() == 0:
            pytest.exit("setup_database: tables were NOT created — check DB connectivity", 1)
    yield
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
    except Exception:
        pass
    await engine.dispose()


@pytest_asyncio.fixture(loop_scope="session", autouse=True)
async def _cleanup_after_test():
    """Truncate all tables after each test for isolation."""
    yield
    factory = _get_test_session_factory()
    async with factory() as session:
        try:
            await session.execute(_truncate_sql())
            await session.commit()
        except Exception:
            await session.rollback()


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
    from interviewbot.config import get_settings

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
