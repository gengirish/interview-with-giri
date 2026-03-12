"""Code execution via Judge0 API for technical coding assessments."""

import asyncio
from dataclasses import dataclass

import httpx
import structlog

from interviewbot.config import get_settings

logger = structlog.get_logger()

LANGUAGE_IDS = {
    "python": 71,  # Python 3.8
    "javascript": 63,  # Node.js 12
    "java": 62,  # Java (OpenJDK 13)
    "c++": 54,  # C++ (GCC 9.2)
    "cpp": 54,
    "c": 50,  # C (GCC 9.2)
    "go": 60,  # Go 1.13
    "ruby": 72,  # Ruby 2.7
    "rust": 73,  # Rust 1.40
    "typescript": 74,  # TypeScript 3.7
}


@dataclass
class ExecutionResult:
    stdout: str
    stderr: str
    compile_output: str
    status: str
    time: str | None
    memory: int | None
    exit_code: int | None


async def execute_code(
    source_code: str,
    language: str,
    stdin: str = "",
    timeout: float = 10.0,
) -> ExecutionResult:
    """Execute code using Judge0 API and return the result."""
    settings = get_settings()
    lang_id = LANGUAGE_IDS.get(language.lower())

    if not lang_id:
        supported = ", ".join(LANGUAGE_IDS.keys())
        return ExecutionResult(
            stdout="",
            stderr=f"Unsupported language: {language}. Supported: {supported}",
            compile_output="",
            status="error",
            time=None,
            memory=None,
            exit_code=None,
        )

    submission_url = f"{settings.judge0_api_url}/submissions"
    headers = {"Content-Type": "application/json"}

    payload = {
        "source_code": source_code,
        "language_id": lang_id,
        "stdin": stdin,
        "cpu_time_limit": timeout,
        "memory_limit": 128000,  # 128 MB
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                submission_url,
                json=payload,
                headers=headers,
                params={"base64_encoded": "false", "wait": "false"},
            )
            response.raise_for_status()
            token = response.json()["token"]

            for _ in range(20):
                await asyncio.sleep(1)
                result_response = await client.get(
                    f"{submission_url}/{token}",
                    params={"base64_encoded": "false"},
                )
                result_response.raise_for_status()
                result = result_response.json()

                status_id = result.get("status", {}).get("id", 0)
                if status_id not in (1, 2):  # Not "In Queue" or "Processing"
                    return ExecutionResult(
                        stdout=result.get("stdout") or "",
                        stderr=result.get("stderr") or "",
                        compile_output=result.get("compile_output") or "",
                        status=result.get("status", {}).get("description", "Unknown"),
                        time=result.get("time"),
                        memory=result.get("memory"),
                        exit_code=result.get("exit_code"),
                    )

            return ExecutionResult(
                stdout="",
                stderr="Code execution timed out",
                compile_output="",
                status="Time Limit Exceeded",
                time=None,
                memory=None,
                exit_code=None,
            )

    except httpx.HTTPError as e:
        logger.error("judge0_error", error=str(e))
        return ExecutionResult(
            stdout="",
            stderr=f"Code execution service error: {e!s}",
            compile_output="",
            status="error",
            time=None,
            memory=None,
            exit_code=None,
        )
