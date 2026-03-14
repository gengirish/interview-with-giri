"""WebSocket handler for voice-based interviews: audio in -> STT -> LLM -> TTS -> audio out."""

import base64
import contextlib
from datetime import UTC, datetime
import json

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.config import get_settings
from interviewbot.models.tables import InterviewSession, JobPosting, Organization, User
from interviewbot.routers.webhooks import dispatch_webhook
from interviewbot.services.ai_engine import AIEngine, InterviewConversation
from interviewbot.services.notifications import send_interview_completed
from interviewbot.services.voice_pipeline import VoiceInterviewPipeline
from interviewbot.websocket.chat_handler import (
    _build_system_prompt,
    _save_message,
    strip_difficulty_tag,
)

logger = structlog.get_logger()


async def handle_voice_interview(websocket: WebSocket, token: str, db: AsyncSession) -> None:
    await websocket.accept()

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one_or_none()
    if not session:
        await websocket.send_json({"type": "error", "content": "Invalid interview token"})
        await websocket.close()
        return

    if session.status == "completed":
        await websocket.send_json({"type": "error", "content": "Interview already completed"})
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

    resume_text = None
    if session.resume_url:
        from interviewbot.routers.uploads import UPLOAD_DIR, _extract_pdf_text

        filename = session.resume_url.split("/")[-1]
        file_path = UPLOAD_DIR / filename
        if file_path.exists():
            resume_text = _extract_pdf_text(file_path)

    engine = AIEngine()
    pipeline = VoiceInterviewPipeline()
    system_prompt = _build_system_prompt(job, config, resume_text=resume_text)
    conversation = InterviewConversation(system_prompt)

    session.status = "in_progress"
    session.started_at = datetime.now(UTC)
    await db.commit()

    try:
        first_question = await engine.chat(conversation.get_messages())
        first_question, _ = strip_difficulty_tag(first_question)
        conversation.add_message("assistant", first_question)
        await _save_message(db, session.id, "interviewer", first_question)

        try:
            audio_bytes = await pipeline.generate_speech(first_question)
            audio_b64 = base64.b64encode(audio_bytes).decode()
            await websocket.send_json(
                {
                    "type": "audio_response",
                    "text": first_question,
                    "audio": audio_b64,
                    "progress": 1,
                    "total": total_questions,
                }
            )
        except RuntimeError:
            await websocket.send_json(
                {
                    "type": "question",
                    "content": first_question,
                    "progress": 1,
                    "total": total_questions,
                }
            )

        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "end":
                break

            if msg.get("type") == "audio":
                audio_data = base64.b64decode(msg["data"])
                await websocket.send_json({"type": "thinking"})

                transcript = await pipeline.process_audio(audio_data, msg.get("format", "webm"))
                conversation.add_message("user", transcript)
                await _save_message(db, session.id, "candidate", transcript)

                await websocket.send_json(
                    {
                        "type": "transcript",
                        "content": transcript,
                    }
                )

                response = await engine.chat(conversation.get_messages())
                response, _ = strip_difficulty_tag(response)
                conversation.add_message("assistant", response)
                await _save_message(db, session.id, "interviewer", response)

                progress = conversation.get_question_count()

                if progress >= total_questions:
                    try:
                        audio_bytes = await pipeline.generate_speech(response)
                        audio_b64 = base64.b64encode(audio_bytes).decode()
                        await websocket.send_json(
                            {
                                "type": "end",
                                "text": response,
                                "audio": audio_b64,
                            }
                        )
                    except RuntimeError:
                        await websocket.send_json({"type": "end", "content": response})
                    break
                else:
                    try:
                        audio_bytes = await pipeline.generate_speech(response)
                        audio_b64 = base64.b64encode(audio_bytes).decode()
                        await websocket.send_json(
                            {
                                "type": "audio_response",
                                "text": response,
                                "audio": audio_b64,
                                "progress": progress,
                                "total": total_questions,
                            }
                        )
                    except RuntimeError:
                        await websocket.send_json(
                            {
                                "type": "question",
                                "content": response,
                                "progress": progress,
                                "total": total_questions,
                            }
                        )

            elif msg.get("type") == "message":
                candidate_text = msg.get("content", "")
                conversation.add_message("user", candidate_text)
                await _save_message(db, session.id, "candidate", candidate_text)

                await websocket.send_json({"type": "thinking"})

                response = await engine.chat(conversation.get_messages())
                response, _ = strip_difficulty_tag(response)
                conversation.add_message("assistant", response)
                await _save_message(db, session.id, "interviewer", response)

                progress = conversation.get_question_count()
                if progress >= total_questions:
                    await websocket.send_json({"type": "end", "content": response})
                    break
                else:
                    await websocket.send_json(
                        {
                            "type": "question",
                            "content": response,
                            "progress": progress,
                            "total": total_questions,
                        }
                    )

    except WebSocketDisconnect:
        logger.info("voice_candidate_disconnected", session_id=str(session.id))
        session.status = "disconnected"
        await db.commit()
        return
    except Exception as e:
        logger.error("voice_interview_error", error=str(e), session_id=str(session.id))
        with contextlib.suppress(Exception):
            await websocket.send_json({"type": "error", "content": "An error occurred."})
        session.status = "disconnected"
        await db.commit()
        return

    session.status = "completed"
    session.completed_at = datetime.now(UTC)
    if session.started_at:
        session.duration_seconds = int((session.completed_at - session.started_at).total_seconds())
    await db.commit()
    logger.info("voice_interview_completed", session_id=str(session.id))

    with contextlib.suppress(Exception):
        org_result = await db.execute(
            select(Organization).where(Organization.id == session.org_id)
        )
        org = org_result.scalar_one_or_none()
        org_inbox_id = org.agentmail_inbox_id if org else None
        user_result = await db.execute(
            select(User)
            .where(User.org_id == session.org_id)
            .where(User.role.in_(["admin", "hiring_manager"]))
        )
        hiring_manager = user_result.scalars().first()
        hiring_manager_email = hiring_manager.email if hiring_manager else None
        if hiring_manager_email:
            settings = get_settings()
            report_url = f"{settings.app_url}/dashboard/interviews/{session.id}"
            await send_interview_completed(
                hiring_manager_email,
                session.candidate_name or "",
                job.title,
                float(session.overall_score) if session.overall_score else None,
                report_url,
                org_inbox_id=org_inbox_id,
            )
    with contextlib.suppress(Exception):
        await dispatch_webhook(
            str(session.org_id),
            "interview.completed",
            {
                "session_id": str(session.id),
                "candidate_name": session.candidate_name or "",
                "status": "completed",
            },
            db,
        )

    # Auto-generate report
    with contextlib.suppress(Exception):
        from interviewbot.services.scoring_engine import score_interview

        report = await score_interview(str(session.id), db)
        if report:
            logger.info("auto_report_generated", session_id=str(session.id))
