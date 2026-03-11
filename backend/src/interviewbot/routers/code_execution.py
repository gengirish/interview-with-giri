from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, status

from interviewbot.services.code_executor import ExecutionResult, execute_code

router = APIRouter(prefix="/code", tags=["Code Execution"])


class CodeSubmission(BaseModel):
    source_code: str = Field(..., max_length=50000)
    language: str = Field(..., min_length=1)
    stdin: str = ""
    timeout: float = Field(10.0, ge=1.0, le=30.0)


class CodeResult(BaseModel):
    stdout: str
    stderr: str
    compile_output: str
    status: str
    time: str | None
    memory: int | None
    exit_code: int | None


@router.post("/execute", response_model=CodeResult)
async def run_code(submission: CodeSubmission) -> CodeResult:
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
