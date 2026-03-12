from __future__ import annotations

from abc import ABC, abstractmethod

import structlog

from interviewbot.config import get_settings

logger = structlog.get_logger()


class LLMProvider(ABC):
    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str: ...


class OpenAIProvider(LLMProvider):
    def __init__(self) -> None:
        from openai import AsyncOpenAI

        settings = get_settings()
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = "gpt-4o"

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""


class ClaudeProvider(LLMProvider):
    def __init__(self) -> None:
        from anthropic import AsyncAnthropic

        settings = get_settings()
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = "claude-sonnet-4-20250514"

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        system = next((m["content"] for m in messages if m["role"] == "system"), "")
        user_msgs = [m for m in messages if m["role"] != "system"]

        response = await self.client.messages.create(
            model=self.model,
            system=system,
            messages=user_msgs,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.content[0].text


class BonsaiProvider(LLMProvider):
    """Free frontier models via Bonsai (https://trybons.ai).

    Uses an OpenAI-compatible API that routes to the best available model
    (GPT-5, Claude, Gemini, etc.) automatically.
    """

    def __init__(self) -> None:
        from openai import AsyncOpenAI

        settings = get_settings()
        self.client = AsyncOpenAI(
            api_key=settings.bonsai_api_key,
            base_url=settings.bonsai_base_url,
        )

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        response = await self.client.chat.completions.create(
            model="default",
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""


class GeminiProvider(LLMProvider):
    """Google Gemini via AI Studio (https://aistudio.google.com).

    Uses Google's OpenAI-compatible endpoint. Free tier: 15 RPM, 1M tokens/day.
    """

    def __init__(self) -> None:
        from openai import AsyncOpenAI

        settings = get_settings()
        self.client = AsyncOpenAI(
            api_key=settings.gemini_api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )
        self.model = settings.gemini_model

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        has_user_msg = any(m["role"] == "user" for m in messages)
        if not has_user_msg:
            messages = [*messages, {"role": "user", "content": "Please begin the interview."}]

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""


class OpenRouterProvider(LLMProvider):
    """Access many models via OpenRouter (https://openrouter.ai).

    Uses an OpenAI-compatible API. Supports models like openai/gpt-oss-120b,
    google/gemini-2.0-flash-exp:free, and hundreds more.
    """

    def __init__(self) -> None:
        from openai import AsyncOpenAI

        settings = get_settings()
        self.client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
        )
        self.model = settings.openrouter_model

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""


class AIEngine:
    """Multi-provider AI engine with automatic fallback.

    Provider priority: OpenAI -> OpenRouter -> Bonsai -> Claude.
    If only one provider is configured, it becomes the primary with no fallback.
    """

    def __init__(self) -> None:
        settings = get_settings()
        providers: list[LLMProvider] = []

        if settings.openai_api_key:
            providers.append(OpenAIProvider())
        if settings.gemini_api_key:
            providers.append(GeminiProvider())
        if settings.openrouter_api_key:
            providers.append(OpenRouterProvider())
        if settings.bonsai_api_key:
            providers.append(BonsaiProvider())
        if settings.anthropic_api_key:
            providers.append(ClaudeProvider())

        self.primary: LLMProvider | None = providers[0] if providers else None
        self.fallback: LLMProvider | None = providers[1] if len(providers) > 1 else None

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        if not self.primary:
            raise RuntimeError(
                "No LLM provider configured. "
                "Set BONSAI_API_KEY (free at https://trybons.ai), "
                "OPENAI_API_KEY, or ANTHROPIC_API_KEY."
            )

        try:
            return await self.primary.chat(messages, temperature, max_tokens)
        except Exception as e:
            logger.warning("primary_llm_failed", error=str(e))
            if self.fallback:
                return await self.fallback.chat(messages, temperature, max_tokens)
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

PAIR_PROGRAMMING_PROMPT = """You are a collaborative pair-programming partner conducting a technical interview for the role of {job_title}.

## Context
- Job Description: {job_description}
- Required Skills: {required_skills}
- Difficulty: {difficulty}
- Questions Remaining: {questions_remaining} of {total_questions}

## Your Personality
You are NOT an interrogator. You are a senior engineer sitting next to the candidate, working through problems together. You are curious, supportive, and genuinely interested in how they think.

## Pair-Programming Rules
1. Ask ONE problem at a time. Start with a clear, practical problem statement.
2. When the candidate submits code, analyze it thoughtfully:
   - Acknowledge what they did well FIRST
   - Then probe their decisions: "I noticed you used a HashMap here — what would happen if our dataset exceeds available RAM?"
   - Ask about trade-offs: "This is O(n²) — could we do better? What would we sacrifice?"
   - Question edge cases: "What happens if the input list is empty? Or contains duplicates?"
3. Go 2-3 levels deep on every significant code decision:
   - Level 1: "Why did you choose this approach?"
   - Level 2: "How would this change if [constraint changes]?"
   - Level 3: "In production, what monitoring or error handling would you add?"
4. If the candidate is stuck, give a gentle hint — like a real pair partner would:
   - "What if we thought about this as a graph problem?"
   - "Have you considered what happens at the boundaries?"
5. Discuss their code as if reviewing a real PR:
   - Naming conventions, readability, testability
   - "If I were reviewing this PR, I'd ask about..."
6. Transition naturally between coding and discussion:
   - After code: discuss architecture implications
   - After discussion: present a related coding challenge
7. Be conversational and use their name when appropriate.
8. After all questions, summarize what you discussed and thank them warmly.

## When Candidate Submits Code
When you receive a message containing [Code Submission], analyze the code and respond with:
- A brief positive observation about their approach
- One specific technical question about their implementation choice
- A follow-up scenario: "Now, what if we needed to handle [additional requirement]?"

NEVER just say "looks good." Always probe deeper.

## Response Format
Respond conversationally. No metadata, scores, or internal notes. Sound like a real engineer, not a chatbot."""

CODE_REVIEW_FOLLOW_UP_PROMPT = """You are reviewing code submitted during a pair-programming interview.

## The Problem Being Solved
{problem_context}

## Candidate's Code ({language})
```
{code}
```

## Execution Result
- Output: {stdout}
- Errors: {stderr}
- Status: {status}

## Previous Discussion Context
{conversation_context}

## Your Task
Generate a thoughtful, conversational follow-up as a pair-programming partner would. You must:
1. Acknowledge ONE specific thing they did well (be genuine, reference exact code)
2. Ask about ONE design decision: "I see you chose [X] — why not [Y]?"
3. Propose a twist: "What if we also needed to [new requirement]? How would your solution change?"

Keep it conversational and natural. 2-4 sentences max. Sound like a senior engineer, not a grading rubric.

Respond with ONLY your conversational follow-up. No JSON, no scores."""

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

GENERAL_SCORING_PROMPT = """Analyze this interview transcript and score the candidate.

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

SWE_SCORING_PROMPT = """You are a senior engineering manager evaluating a software engineering interview transcript.

## Transcript
{transcript}

## Job Context
- Role: {job_title}
- Required Skills: {required_skills}
- Experience Level: {experience_level}

## Scoring Dimensions

Score each dimension from 0.0 to 10.0 with evidence from the transcript.

### Technical Dimensions
1. **Code Quality** — Clean code practices, naming conventions, modular design, DRY principles, modern syntax usage
2. **Problem Solving** — Approach to breaking down problems, algorithmic thinking, ability to identify edge cases, optimization awareness
3. **System Design** — Architecture decisions, scalability considerations, trade-off analysis, technology selection rationale
4. **Security Awareness** — Input validation, authentication/authorization considerations, SQL injection awareness, data protection mindset
5. **Testing Instinct** — Mentions testing, writes tests, considers test cases, discusses test strategies (unit, integration, e2e)
6. **Technical Communication** — Ability to explain complex concepts clearly, thinking out loud, structured reasoning

### Behavioral Dimensions
7. **Problem Decomposition** — Breaking complex problems into manageable parts, systematic approach
8. **Collaboration Signal** — Asks clarifying questions, discusses trade-offs, receptive to hints, pair-programming readiness
9. **Learning Agility** — Adapts when corrected, shows curiosity, references learning from past mistakes

## Response Format

Return a JSON object:
{{
  "technical_scores": {{
    "code_quality": {{"score": 8.0, "evidence": "Direct quote or specific observation from transcript", "notes": "Brief assessment"}},
    "problem_solving": {{"score": 7.5, "evidence": "...", "notes": "..."}},
    "system_design": {{"score": 6.0, "evidence": "...", "notes": "..."}},
    "security_awareness": {{"score": 4.0, "evidence": "...", "notes": "..."}},
    "testing_instinct": {{"score": 5.0, "evidence": "...", "notes": "..."}},
    "technical_communication": {{"score": 8.5, "evidence": "...", "notes": "..."}}
  }},
  "behavioral_scores": {{
    "problem_decomposition": {{"score": 7.0, "evidence": "...", "notes": "..."}},
    "collaboration_signal": {{"score": 8.0, "evidence": "...", "notes": "..."}},
    "learning_agility": {{"score": 6.5, "evidence": "...", "notes": "..."}}
  }},
  "overall_score": 7.2,
  "confidence_score": 0.85,
  "experience_level_assessment": "mid",
  "summary": "3-4 sentence executive summary of the candidate's performance, written for an engineering manager who has 30 seconds to read it",
  "strengths": ["Specific strength 1 with evidence", "Specific strength 2"],
  "concerns": ["Specific concern 1 with evidence", "Specific concern 2"],
  "recommendation": "Strong Hire | Hire | Lean No Hire | No Hire",
  "suggested_follow_up_areas": ["Area that needs deeper probing in next round", "..."],
  "hiring_level_fit": "Appears suited for mid-level IC role based on demonstrated depth"
}}

## Scoring Guidelines
- 9-10: Exceptional, demonstrates mastery beyond role requirements
- 7-8: Strong, meets or exceeds role expectations
- 5-6: Adequate, meets minimum bar with room for growth
- 3-4: Below expectations, significant gaps
- 0-2: Insufficient, fundamental misunderstandings

IMPORTANT: Every score MUST have a direct evidence quote from the transcript. If a dimension was not evaluated during the interview, score it as null and note "Not assessed in this interview."

Return ONLY valid JSON, no markdown or explanation.
"""

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
