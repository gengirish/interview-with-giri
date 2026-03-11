from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("")
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "interviewbot-api"}


@router.get("/db")
async def health_db(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    await db.execute(text("SELECT 1"))
    return {"status": "healthy", "database": "connected"}
