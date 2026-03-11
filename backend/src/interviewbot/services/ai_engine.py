from abc import ABC, abstractmethod

import structlog

from interviewbot.config import get_settings

logger = structlog.get_logger()


class LLMProvider(ABC):
    @abstractmethod
    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.7) -> str: ...


class OpenAIProvider(LLMProvider):
    def __init__(self) -> None:
        from openai import AsyncOpenAI

        settings = get_settings()
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = "gpt-4o"

    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.7) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=1024,
        )
        return response.choices[0].message.content or ""


class ClaudeProvider(LLMProvider):
    def __init__(self) -> None:
        from anthropic import AsyncAnthropic

        settings = get_settings()
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = "claude-sonnet-4-20250514"

    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.7) -> str:
        system = next((m["content"] for m in messages if m["role"] == "system"), "")
        user_msgs = [m for m in messages if m["role"] != "system"]

        response = await self.client.messages.create(
            model=self.model,
            system=system,
            messages=user_msgs,
            temperature=temperature,
            max_tokens=1024,
        )
        return response.content[0].text


class AIEngine:
    def __init__(self) -> None:
        settings = get_settings()
        self.primary: LLMProvider | None = None
        self.fallback: LLMProvider | None = None

        if settings.openai_api_key:
            self.primary = OpenAIProvider()
        if settings.anthropic_api_key:
            self.fallback = ClaudeProvider()

        if not self.primary and self.fallback:
            self.primary = self.fallback
            self.fallback = None

    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.7) -> str:
        if not self.primary:
            raise RuntimeError("No LLM provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.")

        try:
            return await self.primary.chat(messages, temperature)
        except Exception as e:
            logger.warning("primary_llm_failed", error=str(e))
            if self.fallback:
                return await self.fallback.chat(messages, temperature)
            raise


class InterviewConversation:
    def __init__(self, system_prompt: str, max_history: int = 30) -> None:
        self.system_prompt = system_prompt
        self.messages: list[dict[str, str]] = []
        self.max_history = max_history

    def add_message(self, role: str, content: str) -> None:
        self.messages.append({"role": role, "content": content})
        if len(self.messages) > self.max_history:
            self.messages = self.messages[-self.max_history :]

    def get_messages(self) -> list[dict[str, str]]:
        return [{"role": "system", "content": self.system_prompt}, *self.messages]

    def get_question_count(self) -> int:
        return sum(1 for m in self.messages if m["role"] == "assistant")


TECHNICAL_INTERVIEWER_PROMPT = """You are a senior technical interviewer conducting a {interview_format} interview for the role of {job_title}.

## Context
- Job Description: {job_description}
- Required Skills: {required_skills}
- Difficulty: {difficulty}
- Questions Remaining: {questions_remaining} of {total_questions}

## Rules
1. Ask ONE question at a time. Wait for the candidate's response before the next.
2. Start with an introductory question, then progress from easier to harder.
3. Ask follow-up questions when the answer is vague, incomplete, or incorrect.
4. Cover these areas: {required_skills}
5. For coding questions, present a clear problem statement with input/output examples.
6. Be professional, encouraging, and conversational.
7. Never reveal the expected answer or give hints unless the candidate is completely stuck.
8. After all questions, thank the candidate and end the interview.

Respond with ONLY the interview question or follow-up. No metadata or scoring."""

BEHAVIORAL_INTERVIEWER_PROMPT = """You are an experienced behavioral interviewer for the role of {job_title}.

## Context
- Job Description: {job_description}
- Questions Remaining: {questions_remaining} of {total_questions}

## Rules
1. Use the STAR method (Situation, Task, Action, Result) to probe answers.
2. Ask about: leadership, conflict resolution, teamwork, adaptability, communication.
3. Ask follow-ups for specific examples, not generic answers.
4. If the candidate gives a hypothetical answer, redirect to a real example.
5. Be warm and professional.

Respond with ONLY the interview question or follow-up."""

SCORING_PROMPT = """Analyze this interview transcript and score the candidate.

## Transcript
{transcript}

## Job Context
- Role: {job_title}
- Required Skills: {required_skills}

Score each dimension from 0.0 to 10.0. Return JSON:
{{
  "skill_scores": {{"skill_name": {{"score": 8.5, "evidence": "Quote..."}}}},
  "behavioral_scores": {{
    "communication": {{"score": 7.0, "evidence": "..."}},
    "problem_solving": {{"score": 8.0, "evidence": "..."}},
    "cultural_fit": {{"score": 6.5, "evidence": "..."}}
  }},
  "overall_score": 7.5,
  "confidence_score": 0.85,
  "summary": "2-3 sentence summary",
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"],
  "recommendation": "Strong Hire | Hire | No Hire"
}}

Return ONLY valid JSON."""

SKILL_EXTRACTION_PROMPT = """Extract required skills from this job description.

Job Description:
{job_description}

Return JSON:
{{
  "technical_skills": ["skill1", "skill2"],
  "soft_skills": ["skill1", "skill2"],
  "experience_level": "junior|mid|senior|lead",
  "suggested_questions": ["question1", "question2"]
}}

Return ONLY valid JSON."""
