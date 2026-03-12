"""WebSocket handler for voice-based interviews: audio in -> STT -> LLM -> TTS -> audio out."""

import base64
import contextlib
from datetime import UTC, datetime
import json

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.models.tables import InterviewSession, JobPosting
from interviewbot.services.ai_engine import AIEngine, InterviewConversation
from interviewbot.services.voice_pipeline import VoiceInterviewPipeline
from interviewbot.websocket.chat_handler import _build_system_prompt, _save_message

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

    engine = AIEngine()
    pipeline = VoiceInterviewPipeline()
    system_prompt = _build_system_prompt(job, config)
    conversation = InterviewConversation(system_prompt)

    session.status = "in_progress"
    session.started_at = datetime.now(UTC)
    await db.commit()

    try:
        first_question = await engine.chat(conversation.get_messages())
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
