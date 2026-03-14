from __future__ import annotations

import contextlib
from datetime import UTC, datetime
import json
import re

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from interviewbot.config import get_settings
from interviewbot.models.tables import (
    InterviewMessage,
    InterviewSession,
    JobPosting,
    Organization,
    User,
)
from interviewbot.routers.webhooks import dispatch_webhook
from interviewbot.services.ai_engine import AIEngine, InterviewConversation
from interviewbot.services.notifications import send_interview_completed

logger = structlog.get_logger()


def _extract_code(message: str) -> str | None:
    """Extract code block from a [Code Submission] message."""
    if "[Code Submission]" not in message:
        return None
    match = re.search(r"```(?:\w+)?\n(.*?)```", message, re.DOTALL)
    return match.group(1).strip() if match else None


_DIFFICULTY_RE = re.compile(r"<!--DIFFICULTY:(\w+)-->\s*")


def strip_difficulty_tag(text: str) -> tuple[str, str]:
    """Strip the <!--DIFFICULTY:xxx--> tag from AI output. Returns (cleaned_text, difficulty)."""
    match = _DIFFICULTY_RE.search(text)
    difficulty = match.group(1) if match else "medium"
    return _DIFFICULTY_RE.sub("", text), difficulty


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


def _build_system_prompt(
    job: JobPosting, config: dict, resume_text: str | None = None, is_practice: bool = False
) -> str:
    skills = ", ".join(job.required_skills or [])
    role_type = job.role_type or "mixed"

    if role_type in ("technical", "mixed"):
        template = (
            "You are a collaborative pair-programming partner conducting a technical "
            "interview for the role of {title}.\n\n"
            "## Context\n"
            "- Job Description: {jd}\n"
            "- Required Skills: {skills}\n"
            "- Difficulty: {difficulty}\n"
            "- Total Questions: {total}\n\n"
            "## Your Personality\n"
            "You are NOT an interrogator. You are a senior engineer working through "
            "problems with the candidate. You are curious, supportive, and interested "
            "in how they think.\n\n"
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

    prompt = template.format(
        title=job.title,
        jd=job.job_description[:1500],
        skills=skills,
        difficulty=config.get("difficulty", "medium"),
        total=config.get("num_questions", 10),
    )
    language = config.get("language", "en")
    if language and language != "en":
        prompt += (
            f"\n\nIMPORTANT: Conduct this entire interview in the language "
            f"specified by code '{language}'. Ask all questions, provide all "
            f"responses, and communicate entirely in that language. "
            f"Only use English for technical terms that have no standard translation."
        )
    if resume_text:
        prompt += (
            f"\n\n## Candidate Resume\n"
            f"The candidate has provided their resume. Use this context to personalize "
            f"your questions - reference their specific experience, projects, and skills:\n"
            f"{resume_text[:3000]}"
        )
    prompt += (
        "\n\n## Adaptive Difficulty\n"
        "Track the candidate's performance across answers. After each response:\n"
        "- If the candidate gives a strong, detailed answer: INCREASE difficulty\n"
        "- If the candidate struggles or gives a weak answer: DECREASE difficulty\n"
        "- Tag each question internally as [EASY], [MEDIUM], [HARD], or [EXPERT]\n"
        "- Start at the configured difficulty level and adapt from there\n"
        "- Include a hidden tag at the START of each response in the format: "
        "<!--DIFFICULTY:medium--> (this will be parsed by the system)\n"
    )
    if is_practice:
        prompt += (
            "\n\n## PRACTICE MODE - Coaching Enabled\n"
            "This is a PRACTICE interview. After the candidate answers each question:\n"
            "1. Briefly acknowledge their answer\n"
            "2. Provide a SHORT coaching tip (1-2 sentences) on how they could improve\n"
            "3. Format tips as: **Tip:** [your coaching advice]\n"
            "4. Then ask the next question\n"
            "Be encouraging and constructive. Help them learn.\n"
        )
    return prompt


async def _save_message(db: AsyncSession, session_id, role: str, content: str) -> None:
    msg = InterviewMessage(session_id=session_id, role=role, content=content)
    db.add(msg)
    await db.commit()


async def _send_json(websocket: WebSocket, data: dict) -> None:
    await websocket.send_json(data)


async def _handle_end_interview(
    session: InterviewSession,
    db: AsyncSession,
    websocket: WebSocket,
    questions: int,
) -> None:
    # Skip report generation for practice sessions
    if session.is_practice:
        session.status = "completed"
        session.completed_at = datetime.now(UTC)
        if session.started_at:
            session.duration_seconds = int(
                (session.completed_at - session.started_at).total_seconds()
            )
        await db.commit()
        await _send_json(
            websocket,
            {
                "type": "practice_complete",
                "content": "Practice session complete! Review your answers above to improve.",
            },
        )
        return

    session.status = "completed"
    session.completed_at = datetime.now(UTC)
    if session.started_at:
        session.duration_seconds = int((session.completed_at - session.started_at).total_seconds())
    await db.commit()
    logger.info(
        "interview_completed",
        session_id=str(session.id),
        questions=questions,
    )

    job_title = "Unknown"
    org_inbox_id = None
    hiring_manager_email = None
    with contextlib.suppress(Exception):
        job_result = await db.execute(
            select(JobPosting).where(JobPosting.id == session.job_posting_id)
        )
        job = job_result.scalar_one_or_none()
        job_title = job.title if job else "Unknown"
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
            # Update the email notification with the actual score
            if hiring_manager_email and session.overall_score:
                settings_obj = get_settings()
                report_url = f"{settings_obj.app_url}/dashboard/interviews/{session.id}"
                await send_interview_completed(
                    hiring_manager_email,
                    session.candidate_name or "",
                    job_title,
                    float(session.overall_score),
                    report_url,
                    org_inbox_id=org_inbox_id,
                )


async def _process_candidate_message(
    session: InterviewSession,
    candidate_text: str,
    conversation: InterviewConversation,
    tracker: FollowUpTracker | None,
    engine: AIEngine,
    job: JobPosting,
    config: dict,
    total_questions: int,
    is_technical: bool,
    db: AsyncSession,
    websocket: WebSocket,
) -> tuple[str, int, bool]:
    is_code_submission = "[Code Submission]" in candidate_text

    conversation.add_message("user", candidate_text)
    await _save_message(db, session.id, "candidate", candidate_text)
    await _send_json(websocket, {"type": "thinking"})

    injections_added = 0
    if is_code_submission and is_technical:
        code = _extract_code(candidate_text)
        if code:
            code_context = (
                f"\n\n[The candidate just submitted this code:\n```\n"
                f"{code[:2000]}\n```\n"
                f"Analyze their code and respond as a pair-programming partner. "
                f"Acknowledge something specific they did well, then probe a design "
                f"decision, then suggest a twist or follow-up scenario. "
                f"Keep it conversational.]"
            )
            conversation.add_message("system", code_context)
            injections_added += 1
    if tracker and tracker.should_probe_deeper():
        depth_hint = tracker.get_depth_hint()
        if depth_hint:
            conversation.add_message("system", depth_hint)
            injections_added += 1

    response = await engine.chat(conversation.get_messages())

    response, current_difficulty = strip_difficulty_tag(response)

    progression = session.difficulty_progression or []
    progression.append(
        {
            "question": len(progression) + 1,
            "difficulty": current_difficulty,
        }
    )
    session.difficulty_progression = progression
    await db.commit()

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
    should_end = progress >= total_questions

    if should_end:
        await _send_json(websocket, {"type": "end", "content": response})
    else:
        msg_type = "code_review" if (is_code_submission and is_technical) else "question"
        await _send_json(
            websocket,
            {
                "type": msg_type,
                "content": response,
                "progress": progress,
                "total": total_questions,
            },
        )

    return response, progress, should_end


async def handle_text_interview(websocket: WebSocket, token: str, db: AsyncSession) -> None:
    await websocket.accept()

    result = await db.execute(select(InterviewSession).where(InterviewSession.token == token))
    session = result.scalar_one_or_none()

    if not session:
        await _send_json(websocket, {"type": "error", "content": "Invalid interview token"})
        await websocket.close()
        return

    if session.status == "completed":
        await _send_json(
            websocket,
            {"type": "error", "content": "This interview has already been completed"},
        )
        await websocket.close()
        return

    job_result = await db.execute(
        select(JobPosting).where(JobPosting.id == session.job_posting_id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        await _send_json(websocket, {"type": "error", "content": "Job posting not found"})
        await websocket.close()
        return

    config = job.interview_config or {}
    total_questions = config.get("num_questions", 10)
    is_technical = (job.role_type or "").lower() in ("technical", "mixed")

    resume_text = None
    if session.resume_url:
        from interviewbot.routers.uploads import UPLOAD_DIR, _extract_pdf_text

        filename = session.resume_url.split("/")[-1]
        file_path = UPLOAD_DIR / filename
        if file_path.exists():
            resume_text = _extract_pdf_text(file_path)

    engine = AIEngine()
    system_prompt = _build_system_prompt(
        job, config, resume_text=resume_text, is_practice=bool(session.is_practice)
    )
    conversation = InterviewConversation(system_prompt)
    tracker = FollowUpTracker(max_depth=3) if is_technical else None

    session.status = "in_progress"
    session.started_at = datetime.now(UTC)
    await db.commit()

    try:
        first_question = await engine.chat(conversation.get_messages())
        first_question, current_difficulty = strip_difficulty_tag(first_question)

        progression = session.difficulty_progression or []
        progression.append({"question": 1, "difficulty": current_difficulty})
        session.difficulty_progression = progression
        await db.commit()

        conversation.add_message("assistant", first_question)
        await _save_message(db, session.id, "interviewer", first_question)

        await _send_json(
            websocket,
            {
                "type": "question",
                "content": first_question,
                "progress": 1,
                "total": total_questions,
            },
        )

        if tracker:
            tracker.on_new_question()

        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "end":
                break

            if msg.get("type") == "message":
                candidate_text = msg.get("content", "")
                _, _, should_end = await _process_candidate_message(
                    session,
                    candidate_text,
                    conversation,
                    tracker,
                    engine,
                    job,
                    config,
                    total_questions,
                    is_technical,
                    db,
                    websocket,
                )
                if should_end:
                    break

    except WebSocketDisconnect:
        logger.info("candidate_disconnected", session_id=str(session.id))
        session.status = "disconnected"
        await db.commit()
        return
    except Exception as e:
        logger.error("interview_error", error=str(e), session_id=str(session.id))
        with contextlib.suppress(Exception):
            await _send_json(
                websocket,
                {"type": "error", "content": "An error occurred. Please try again."},
            )
        session.status = "disconnected"
        await db.commit()
        return

    await _handle_end_interview(session, db, websocket, conversation.get_question_count())
