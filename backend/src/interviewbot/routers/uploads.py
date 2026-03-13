"""Resume upload and text extraction for interview personalization."""

from __future__ import annotations

from pathlib import Path
import uuid as uuid_mod

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.dependencies import get_db
from interviewbot.models.tables import InterviewSession

logger = structlog.get_logger()

router = APIRouter(prefix="/uploads", tags=["Uploads"])

UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads"
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


def _extract_pdf_text(file_path: str | Path) -> str:
    """Extract text from a PDF file."""
    try:
        import PyPDF2

        path = Path(file_path)
        text_parts = []
        with path.open("rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages[:10]:  # limit to 10 pages
                text_parts.append(page.extract_text() or "")
        return "\n".join(text_parts).strip()
    except Exception as e:
        logger.warning("pdf_extraction_failed", error=str(e))
        return ""


@router.post("/resume/{token}")
async def upload_resume(
    token: str,
    file: UploadFile = File(),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Upload candidate resume (PDF) for an interview session."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are accepted",
        )

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found",
        )
    if session.status not in ("pending", "in_progress"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interview is not active",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large (max 5 MB)",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid_mod.uuid4()}.pdf"
    file_path = UPLOAD_DIR / filename

    file_path.write_bytes(content)

    resume_text = _extract_pdf_text(file_path)
    session.resume_url = f"/uploads/{filename}"
    await db.commit()

    logger.info(
        "resume_uploaded",
        session_id=str(session.id),
        filename=filename,
        text_length=len(resume_text),
    )

    return {
        "filename": filename,
        "resume_url": session.resume_url,
        "text_preview": resume_text[:500] if resume_text else "",
        "text_length": len(resume_text),
    }


@router.get("/files/{filename}")
async def serve_upload(filename: str) -> FileResponse:
    """Serve an uploaded file."""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )
    return FileResponse(str(file_path), media_type="application/pdf")
