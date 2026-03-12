from __future__ import annotations

import json
import re
from datetime import datetime, timezone

import structlog
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interviewbot.models.tables import InterviewMessage, InterviewSession, JobPosting
from interviewbot.services.ai_engine import AIEngine, InterviewConversation

logger = structlog.get_logger()


def _extract_code(message: str) -> str | None:
    """Extract code block from a [Code Submission] message."""
    if "[Code Submission]" not in message:
        return None
    match = re.search(r"```(?:\w+)?\n(.*?)```", message, re.DOTALL)
    return match.group(1).strip() if match else None


class FollowUpTracker:
    """Tracks follow-up depth to ensure multi-level probing."""

    def __init__(self, max_depth: int = 3) -> None:
        self.current_topic_depth: int = 0
        self.max_depth = max_depth
        self.topics_explored: int = 0

    def on_new_question(self) -> None:
        if self.current_topic_depth > 0:
            self.topics_explored += 1
        self.current_topic_depth = 1

    def on_follow_up(self) -> None:
        self.current_topic_depth += 1

    def should_probe_deeper(self) -> bool:
        return self.current_topic_depth < self.max_depth

    def get_depth_hint(self) -> str:
        if self.current_topic_depth >= self.max_depth:
            return ""
        level = self.current_topic_depth + 1
        hints = {
            2: "Dig deeper: ask about trade-offs or alternative approaches.",
            3: "Final probe: ask about production readiness, monitoring, or scaling.",
        }
        return hints.get(level, "")


def _build_system_prompt(job: JobPosting, config: dict) -> str:
    skills = ", ".join(job.required_skills or [])
    role_type = job.role_type or "mixed"

    if role_type in ("technical", "mixed"):
        template = (
            "You are a collaborative pair-programming partner conducting a technical interview "
            "for the role of {title}.\n\n"
            "## Context\n"
            "- Job Description: {jd}\n"
            "- Required Skills: {skills}\n"
            "- Difficulty: {difficulty}\n"
            "- Total Questions: {total}\n\n"
            "## Your Personality\n"
            "You are NOT an interrogator. You are a senior engineer working through problems "
            "with the candidate. You are curious, supportive, and interested in how they think.\n\n"
            "## Pair-Programming Rules\n"
            "1. Ask ONE problem at a time with a clear, practical problem statement.\n"
            "2. When code is submitted (marked with [Code Submission]), analyze it:\n"
            "   - Acknowledge what they did well FIRST\n"
            "   - Probe their decisions: 'I noticed you used X — what if Y?'\n"
            "   - Ask about trade-offs and complexity\n"
            "   - Question edge cases\n"
            "3. Go 2-3 levels deep on significant decisions:\n"
            "   - Level 1: 'Why this approach?'\n"
            "   - Level 2: 'How would this change if [constraint changes]?'\n"
            "   - Level 3: 'In production, what monitoring or error handling would you add?'\n"
            "4. If stuck, give a gentle hint like a real pair partner.\n"
            "5. Discuss code as if reviewing a PR — naming, readability, testability.\n"
            "6. Transition between coding and architecture discussion naturally.\n"
            "7. After all questions, summarize what you discussed and thank them.\n\n"
            "NEVER just say 'looks good.' Always probe deeper.\n"
            "Respond conversationally. No metadata or scores."
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
    is_technical = (job.role_type or "").lower() in ("technical", "mixed")

    engine = AIEngine()
    system_prompt = _build_system_prompt(job, config)
    conversation = InterviewConversation(system_prompt)
    tracker = FollowUpTracker(max_depth=3) if is_technical else None

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

        if tracker:
            tracker.on_new_question()

        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "end":
                break

            if msg.get("type") == "message":
                candidate_text = msg.get("content", "")
                is_code_submission = "[Code Submission]" in candidate_text

                conversation.add_message("user", candidate_text)
                await _save_message(db, session.id, "candidate", candidate_text)
                await websocket.send_json({"type": "thinking"})

                injections_added = 0
                if is_code_submission and is_technical:
                    code = _extract_code(candidate_text)
                    if code:
                        code_context = (
                            f"\n\n[The candidate just submitted this code:\n```\n{code[:2000]}\n```\n"
                            f"Analyze their code and respond as a pair-programming partner. "
                            f"Acknowledge something specific they did well, then probe a design decision, "
                            f"then suggest a twist or follow-up scenario. Keep it conversational.]"
                        )
                        conversation.add_message("system", code_context)
                        injections_added += 1
                if tracker and tracker.should_probe_deeper():
                    depth_hint = tracker.get_depth_hint()
                    if depth_hint:
                        conversation.add_message("system", depth_hint)
                        injections_added += 1

                response = await engine.chat(conversation.get_messages())

                for _ in range(injections_added):
                    conversation.messages.pop(-1)

                if tracker:
                    if "?" in response:
                        tracker.on_new_question()
                    else:
                        tracker.on_follow_up()

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
                    msg_type = "code_review" if (is_code_submission and is_technical) else "question"
                    await websocket.send_json({
                        "type": msg_type,
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
