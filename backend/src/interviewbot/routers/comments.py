"""Report comments with @mention notifications."""

from __future__ import annotations

import contextlib
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.config import get_settings
from interviewbot.dependencies import get_db, get_org_id, require_role
from interviewbot.models.tables import (
    CandidateReport,
    InterviewSession,
    Organization,
    ReportComment,
    User,
)

logger = structlog.get_logger()
router = APIRouter(prefix="/reports", tags=["Comments"])


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class CommentResponse(BaseModel):
    id: UUID
    report_id: UUID
    user_id: UUID
    user_name: str
    user_email: str
    content: str
    mentioned_user_ids: list[str]
    created_at: str


@router.post("/{session_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(
    session_id: UUID,
    body: CommentCreate,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
):
    """Add a comment to a report. Detects @mentions and notifies mentioned users."""
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")

    report_result = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == session_id)
    )
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")

    mention_pattern = re.compile(r"@(\S+@\S+\.\S+)")
    mentioned_emails = mention_pattern.findall(body.content)

    mentioned_user_ids: list[str] = []
    if mentioned_emails:
        users_result = await db.execute(
            select(User).where(
                User.email.in_(mentioned_emails),
                User.org_id == org_id,
            )
        )
        mentioned_users = users_result.scalars().all()
        mentioned_user_ids = [str(u.id) for u in mentioned_users]

        with contextlib.suppress(Exception):
            from interviewbot.services.notifications import _build_html, _send_email

            settings = get_settings()
            commenter_result = await db.execute(select(User).where(User.id == UUID(user["sub"])))
            commenter = commenter_result.scalar_one_or_none()
            commenter_name = commenter.full_name if commenter else user.get("email", "Someone")
            candidate_name = session.candidate_name or "a candidate"
            report_url = f"{settings.app_url}/dashboard/interviews/{session_id}"

            org_result = await db.execute(select(Organization).where(Organization.id == org_id))
            org = org_result.scalar_one_or_none()
            org_inbox_id = org.agentmail_inbox_id if org else None

            body_html = (
                f"<p><strong>{commenter_name}</strong> mentioned you in a comment on "
                f"<strong>{candidate_name}</strong>'s interview report.</p>"
                f'<p>Comment: "{body.content[:200]}"</p>'
                f'<p><a href="{report_url}">View Report</a></p>'
            )
            subject = f"{commenter_name} mentioned you in a report comment"
            html = _build_html(subject, body_html)

            for mu in mentioned_users:
                await _send_email(
                    to_email=mu.email,
                    subject=subject,
                    html=html,
                    org_inbox_id=org_inbox_id,
                )

    comment = ReportComment(
        report_id=report.id,
        user_id=UUID(user["sub"]),
        content=body.content,
        mentioned_user_ids=mentioned_user_ids,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    commenter_result = await db.execute(select(User).where(User.id == comment.user_id))
    commenter = commenter_result.scalar_one_or_none()
    return {
        "id": str(comment.id),
        "report_id": str(comment.report_id),
        "user_id": str(comment.user_id),
        "user_name": commenter.full_name if commenter else "",
        "user_email": commenter.email if commenter else "",
        "content": comment.content,
        "mentioned_user_ids": comment.mentioned_user_ids or [],
        "created_at": comment.created_at.isoformat(),
    }


@router.get("/{session_id}/comments")
async def list_comments(
    session_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager", "viewer")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> list[dict]:
    """Get all comments for a report."""
    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")

    report_result = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == session_id)
    )
    report = report_result.scalar_one_or_none()
    if not report:
        return []

    result = await db.execute(
        select(ReportComment, User.full_name, User.email)
        .join(User, ReportComment.user_id == User.id)
        .where(ReportComment.report_id == report.id)
        .order_by(ReportComment.created_at.asc())
    )
    rows = result.all()

    return [
        {
            "id": str(comment.id),
            "report_id": str(comment.report_id),
            "user_id": str(comment.user_id),
            "user_name": full_name,
            "user_email": email,
            "content": comment.content,
            "mentioned_user_ids": comment.mentioned_user_ids or [],
            "created_at": comment.created_at.isoformat(),
        }
        for comment, full_name, email in rows
    ]


@router.delete("/{session_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    session_id: UUID,
    comment_id: UUID,
    user: dict = Depends(require_role("admin", "hiring_manager")),
    db: AsyncSession = Depends(get_db),
    org_id: UUID = Depends(get_org_id),
) -> None:
    """Delete a comment (own comments or admin)."""
    result = await db.execute(select(ReportComment).where(ReportComment.id == comment_id))
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")

    session_result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.org_id == org_id,
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")

    report_result = await db.execute(
        select(CandidateReport).where(CandidateReport.session_id == session_id)
    )
    report = report_result.scalar_one_or_none()
    if not report or str(comment.report_id) != str(report.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")

    if str(comment.user_id) != user["sub"] and user.get("role") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to delete this comment")

    await db.delete(comment)
    await db.commit()
