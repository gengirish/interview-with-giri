from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from interviewbot.config import get_settings

_engine = None
_session_factory = None


def get_engine():  # type: ignore[no-untyped-def]
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            echo=settings.debug,
            pool_size=10,
            max_overflow=20,
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
