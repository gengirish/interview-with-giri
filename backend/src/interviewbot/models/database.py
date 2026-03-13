import os
import ssl as _ssl

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from interviewbot.config import get_settings

_engine = None
_session_factory = None


def _make_connect_args(url: str) -> dict:  # type: ignore[type-arg]
    """Build connect_args for asyncpg when SSL is needed."""
    if "sslmode=" in url:
        ctx = _ssl.create_default_context()
        ctx.check_hostname = False
        return {"ssl": ctx}
    return {}


def _strip_sslmode(url: str) -> str:
    """Remove sslmode param from URL (asyncpg uses connect_args instead)."""
    import re

    return re.sub(r"[?&]sslmode=[^&]*", "", url)


def get_engine():  # type: ignore[no-untyped-def]
    global _engine
    if _engine is None:
        settings = get_settings()
        url = _strip_sslmode(settings.database_url)
        connect_args = _make_connect_args(settings.database_url)
        pool_size = int(os.environ.get("POOL_SIZE", "10"))
        pool_max_overflow = int(os.environ.get("POOL_MAX_OVERFLOW", "20"))
        _engine = create_async_engine(
            url,
            echo=settings.debug,
            pool_size=pool_size,
            max_overflow=pool_max_overflow,
            pool_pre_ping=True,
            pool_recycle=1800,
            connect_args=connect_args,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory
