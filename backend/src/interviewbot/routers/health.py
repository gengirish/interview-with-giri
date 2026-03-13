from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
import redis
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.config import get_settings
from interviewbot.dependencies import get_db

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("")
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "interviewbot-api"}


@router.get("/db")
async def health_db(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    await db.execute(text("SELECT 1"))
    return {"status": "healthy", "database": "connected"}


@router.get("/full", response_model=None)
async def full_health_check() -> JSONResponse:
    """Combined health check for DB and Redis."""
    result: dict = {"status": "healthy", "checks": {}}

    # DB check
    try:
        from interviewbot.models.database import get_session_factory

        factory = get_session_factory()
        async with factory() as db:
            await db.execute(text("SELECT 1"))
        result["checks"]["database"] = "ok"
    except Exception as e:
        result["checks"]["database"] = f"error: {e!s}"
        result["status"] = "degraded"

    # Redis check
    try:
        import redis.asyncio as aioredis

        settings = get_settings()
        if settings.redis_url:
            r = aioredis.from_url(settings.redis_url)
            await r.ping()
            await r.aclose()
            result["checks"]["redis"] = "ok"
        else:
            result["checks"]["redis"] = "not configured"
    except Exception as e:
        result["checks"]["redis"] = f"error: {e!s}"
        result["status"] = "degraded"

    status_code = 200 if result["status"] == "healthy" else 503
    return JSONResponse(content=result, status_code=status_code)


@router.get("/redis", response_model=None)
async def health_redis() -> dict[str, str] | JSONResponse:
    settings = get_settings()
    client = Redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    try:
        await client.ping()
        return {"status": "healthy", "redis": "connected"}
    except (redis.ConnectionError, redis.TimeoutError, ConnectionRefusedError, OSError):
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "redis": "disconnected"},
        )
    finally:
        await client.aclose()
