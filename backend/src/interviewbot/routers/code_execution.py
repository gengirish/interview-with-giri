from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.dependencies import get_db
from interviewbot.models.tables import InterviewSession
from interviewbot.routers.auth import limiter
from interviewbot.services.code_executor import execute_code

router = APIRouter(prefix="/code", tags=["Code Execution"])


class CodeSubmission(BaseModel):
    source_code: str = Field(..., max_length=50000)
    language: str = Field(..., min_length=1)
    stdin: str = ""
    timeout: float = Field(10.0, ge=1.0, le=30.0)
    interview_token: str = Field(..., min_length=1)


class CodeResult(BaseModel):
    stdout: str
    stderr: str
    compile_output: str
    status: str
    time: str | None
    memory: int | None
    exit_code: int | None


async def _validate_interview_token(token: str, db: AsyncSession) -> None:
    from fastapi import HTTPException, status

    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.token == token,
            InterviewSession.status.in_(("pending", "in_progress")),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid or expired interview token")


@router.post("/execute", response_model=CodeResult)
@limiter.limit("10/minute")
async def run_code(
    request: Request,
    submission: CodeSubmission,
    db: AsyncSession = Depends(get_db),
) -> CodeResult:
    await _validate_interview_token(submission.interview_token, db)
    result = await execute_code(
        source_code=submission.source_code,
        language=submission.language,
        stdin=submission.stdin,
        timeout=submission.timeout,
    )
    return CodeResult(
        stdout=result.stdout,
        stderr=result.stderr,
        compile_output=result.compile_output,
        status=result.status,
        time=result.time,
        memory=result.memory,
        exit_code=result.exit_code,
    )
