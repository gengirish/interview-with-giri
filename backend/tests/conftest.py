import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from interviewbot.config import get_settings
from interviewbot.main import create_app

DEMO_ORG_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _make_token(role: str = "admin", org_id: str = DEMO_ORG_ID) -> str:
    settings = get_settings()
    return jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "email": f"{role}@democorp.com",
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
