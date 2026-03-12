from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
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


@router.get("/redis", response_model=None)
async def health_redis() -> dict[str, str] | JSONResponse:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    try:
        await redis.ping()
        return {"status": "healthy", "redis": "connected"}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "redis": "disconnected"},
        )
    finally:
        await redis.aclose()
