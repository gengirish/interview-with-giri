"""Ask AI - natural language search across all interviews."""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.dependencies import get_current_user, get_db
from interviewbot.models.tables import CandidateReport, InterviewMessage, InterviewSession
from interviewbot.services.ai_engine import AIEngine

logger = structlog.get_logger()
router = APIRouter(prefix="/ai", tags=["AI Assistant"])


class AskRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=500)
    job_id: str | None = None


class Citation(BaseModel):
    session_id: str
    candidate_name: str | None
    content_snippet: str
    source_type: str  # "transcript" or "report"


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation]
    sessions_searched: int


@router.post("/ask", response_model=AskResponse)
async def ask_ai(
    body: AskRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(403, "Organization context required")

    # Build base query for sessions in this org
    session_query = select(InterviewSession).where(
        InterviewSession.org_id == org_id,
        InterviewSession.status == "completed",
    )
    if body.job_id:
        session_query = session_query.where(InterviewSession.job_posting_id == body.job_id)

    session_result = await db.execute(session_query.limit(200))
    sessions = session_result.scalars().all()

    if not sessions:
        return AskResponse(
            answer="No completed interviews found to search.",
            citations=[],
            sessions_searched=0,
        )

    session_ids = [s.id for s in sessions]
    session_map = {str(s.id): s for s in sessions}

    msg_query = (
        select(InterviewMessage)
        .where(InterviewMessage.session_id.in_(session_ids))
        .order_by(InterviewMessage.created_at.asc())
        .limit(100)
    )
    msg_result = await db.execute(msg_query)
    all_messages = msg_result.scalars().all()

    # Search reports
    report_query = select(CandidateReport).where(CandidateReport.session_id.in_(session_ids))
    report_result = await db.execute(report_query)
    reports = report_result.scalars().all()

    # Build context for LLM
    context_parts = []
    citations = []

    # Add report summaries
    for report in reports[:20]:
        session = session_map.get(str(report.session_id))
        name = session.candidate_name if session else "Unknown"
        score = (
            float(session.overall_score)
            if session and session.overall_score is not None
            else "N/A"
        )
        context_parts.append(
            f"[Candidate: {name} | Session: {report.session_id}]\n"
            f"Score: {score}/10 | "
            f"Recommendation: {report.recommendation}\n"
            f"Summary: {report.ai_summary or 'N/A'}\n"
            f"Strengths: {', '.join(report.strengths or [])}\n"
            f"Concerns: {', '.join(report.concerns or [])}\n"
        )

    # Add relevant transcript snippets (group by session)
    msgs_by_session: dict[str, list] = defaultdict(list)
    for msg in all_messages:
        msgs_by_session[str(msg.session_id)].append(msg)

    for sid, msgs in list(msgs_by_session.items())[:10]:
        session = session_map.get(sid)
        name = session.candidate_name if session else "Unknown"
        transcript = "\n".join(
            f"{'Interviewer' if m.role == 'interviewer' else 'Candidate'}: {m.content[:200]}"
            for m in msgs[:20]
        )
        context_parts.append(f"[Transcript - {name} | Session: {sid}]\n{transcript}\n")

    context = "\n---\n".join(context_parts)

    prompt = f"""You are an AI assistant helping a hiring team search across their interview data.

## Interview Data
{context[:12000]}

## User Question
{body.query}

## Instructions
Answer the question based ONLY on the interview data above. Be specific and
cite which candidate/session your answer refers to.

Format your response as:
- A clear, concise answer to the question
- Reference specific candidates by name when relevant
- Include scores and evidence where applicable
- If the data doesn't contain enough information to answer, say so

Provide a helpful, actionable answer."""

    engine = AIEngine()
    answer = await engine.chat(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=2048,
    )

    # Build citations from reports referenced in answer
    for report in reports[:10]:
        session = session_map.get(str(report.session_id))
        if session and session.candidate_name and session.candidate_name.lower() in answer.lower():
            citations.append(
                Citation(
                    session_id=str(report.session_id),
                    candidate_name=session.candidate_name,
                    content_snippet=(report.ai_summary[:200] if report.ai_summary else ""),
                    source_type="report",
                )
            )

    return AskResponse(
        answer=answer,
        citations=citations[:10],
        sessions_searched=len(sessions),
    )
