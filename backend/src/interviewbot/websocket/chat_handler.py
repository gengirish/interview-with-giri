import json
from datetime import datetime, timezone

import structlog
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.models.tables import InterviewMessage, InterviewSession, JobPosting
from interviewbot.services.ai_engine import AIEngine, InterviewConversation

logger = structlog.get_logger()


def _build_system_prompt(job: JobPosting, config: dict) -> str:
    skills = ", ".join(job.required_skills or [])
    role_type = job.role_type or "mixed"

    if role_type == "technical":
        template = (
            "You are a senior technical interviewer conducting a text-based interview "
            "for the role of {title}.\n\n"
            "## Context\n"
            "- Job Description: {jd}\n"
            "- Required Skills: {skills}\n"
            "- Difficulty: {difficulty}\n"
            "- Total Questions: {total}\n\n"
            "## Rules\n"
            "1. Ask ONE question at a time.\n"
            "2. Start with an intro, then progress from easier to harder.\n"
            "3. Ask follow-ups when answers are vague or incorrect.\n"
            "4. Cover these areas: {skills}\n"
            "5. Be professional, encouraging, conversational.\n"
            "6. Never reveal expected answers.\n"
            "7. After all questions, thank the candidate and say the interview is complete.\n\n"
            "Respond with ONLY the interview question or follow-up."
        )
    else:
        template = (
            "You are an experienced interviewer conducting a text-based interview "
            "for the role of {title}.\n\n"
            "## Context\n"
            "- Job Description: {jd}\n"
            "- Key Skills: {skills}\n"
            "- Total Questions: {total}\n\n"
            "## Rules\n"
            "1. Ask ONE question at a time.\n"
            "2. Mix behavioral (STAR method) and situational questions.\n"
            "3. Ask follow-ups to get specific real examples.\n"
            "4. If answers are hypothetical, redirect to real experiences.\n"
            "5. Be warm and professional.\n"
            "6. After all questions, thank the candidate.\n\n"
            "Respond with ONLY the interview question or follow-up."
        )

    return template.format(
        title=job.title,
        jd=job.job_description[:1500],
        skills=skills,
        difficulty=config.get("difficulty", "medium"),
        total=config.get("num_questions", 10),
    )


async def _save_message(
    db: AsyncSession, session_id, role: str, content: str
) -> None:
    msg = InterviewMessage(session_id=session_id, role=role, content=content)
    db.add(msg)
    await db.commit()


async def handle_text_interview(websocket: WebSocket, token: str, db: AsyncSession) -> None:
    await websocket.accept()

    result = await db.execute(
        select(InterviewSession).where(InterviewSession.token == token)
    )
    session = result.scalar_one_or_none()

    if not session:
        await websocket.send_json({"type": "error", "content": "Invalid interview token"})
        await websocket.close()
        return

    if session.status == "completed":
        await websocket.send_json({"type": "error", "content": "This interview has already been completed"})
        await websocket.close()
        return

    job_result = await db.execute(
        select(JobPosting).where(JobPosting.id == session.job_posting_id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        await websocket.send_json({"type": "error", "content": "Job posting not found"})
        await websocket.close()
        return

    config = job.interview_config or {}
    total_questions = config.get("num_questions", 10)

    engine = AIEngine()
    system_prompt = _build_system_prompt(job, config)
    conversation = InterviewConversation(system_prompt)

    session.status = "in_progress"
    session.started_at = datetime.now(timezone.utc)
    await db.commit()

    try:
        first_question = await engine.chat(conversation.get_messages())
        conversation.add_message("assistant", first_question)
        await _save_message(db, session.id, "interviewer", first_question)

        await websocket.send_json({
            "type": "question",
            "content": first_question,
            "progress": 1,
            "total": total_questions,
        })

        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "end":
                break

            if msg.get("type") == "message":
                candidate_text = msg.get("content", "")
                conversation.add_message("user", candidate_text)
                await _save_message(db, session.id, "candidate", candidate_text)

                await websocket.send_json({"type": "thinking"})

                response = await engine.chat(conversation.get_messages())
                conversation.add_message("assistant", response)
                await _save_message(db, session.id, "interviewer", response)

                progress = conversation.get_question_count()

                if progress >= total_questions:
                    await websocket.send_json({
                        "type": "end",
                        "content": response,
                    })
                    break
                else:
                    await websocket.send_json({
                        "type": "question",
                        "content": response,
                        "progress": progress,
                        "total": total_questions,
                    })

    except WebSocketDisconnect:
        logger.info("candidate_disconnected", session_id=str(session.id))
        session.status = "disconnected"
        await db.commit()
        return
    except Exception as e:
        logger.error("interview_error", error=str(e), session_id=str(session.id))
        try:
            await websocket.send_json({"type": "error", "content": "An error occurred. Please try again."})
        except Exception:
            pass
        session.status = "disconnected"
        await db.commit()
        return

    session.status = "completed"
    session.completed_at = datetime.now(timezone.utc)
    if session.started_at:
        session.duration_seconds = int(
            (session.completed_at - session.started_at).total_seconds()
        )
    await db.commit()

    logger.info(
        "interview_completed",
        session_id=str(session.id),
        questions=conversation.get_question_count(),
    )
