"""Voice interview pipeline: STT (Whisper) -> LLM -> TTS (ElevenLabs)."""

from collections.abc import AsyncIterator
import io

import structlog

from interviewbot.config import get_settings

logger = structlog.get_logger()


class WhisperSTT:
    """Speech-to-text using OpenAI Whisper API."""

    def __init__(self) -> None:
        from openai import AsyncOpenAI

        settings = get_settings()
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def transcribe(self, audio_bytes: bytes, format: str = "webm") -> str:
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = f"audio.{format}"

        response = await self.client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="en",
        )
        return response.text


class ElevenLabsTTS:
    """Text-to-speech using ElevenLabs API with streaming."""

    VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel - professional female voice

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.elevenlabs_api_key

    async def synthesize(self, text: str) -> bytes:
        import httpx

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.VOICE_ID}"
        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "text": text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {
                "stability": 0.75,
                "similarity_boost": 0.75,
            },
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            return response.content

    async def synthesize_stream(self, text: str) -> AsyncIterator[bytes]:
        import httpx

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.VOICE_ID}/stream"
        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "text": text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {
                "stability": 0.75,
                "similarity_boost": 0.75,
            },
        }

        async with (
            httpx.AsyncClient(timeout=60.0) as client,
            client.stream("POST", url, json=payload, headers=headers) as response,
        ):
            response.raise_for_status()
            async for chunk in response.aiter_bytes(chunk_size=4096):
                yield chunk


class VoiceInterviewPipeline:
    """Orchestrates the full voice interview pipeline."""

    def __init__(self) -> None:
        settings = get_settings()
        self.stt: WhisperSTT | None = None
        self.tts: ElevenLabsTTS | None = None

        if settings.openai_api_key:
            self.stt = WhisperSTT()
        if settings.elevenlabs_api_key:
            self.tts = ElevenLabsTTS()

    async def process_audio(self, audio_bytes: bytes, format: str = "webm") -> str:
        if not self.stt:
            raise RuntimeError("STT not configured. Set OPENAI_API_KEY.")
        transcript = await self.stt.transcribe(audio_bytes, format)
        logger.info("stt_transcribed", length=len(transcript))
        return transcript

    async def generate_speech(self, text: str) -> bytes:
        if not self.tts:
            raise RuntimeError("TTS not configured. Set ELEVENLABS_API_KEY.")
        audio = await self.tts.synthesize(text)
        logger.info("tts_generated", audio_size=len(audio))
        return audio

    async def generate_speech_stream(self, text: str) -> AsyncIterator[bytes]:
        if not self.tts:
            raise RuntimeError("TTS not configured. Set ELEVENLABS_API_KEY.")
        async for chunk in self.tts.synthesize_stream(text):
            yield chunk
