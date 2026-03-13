"""Unit tests for voice pipeline (STT/TTS). No DB needed."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from interviewbot.services.voice_pipeline import GeminiSTT, VoiceInterviewPipeline, WhisperSTT


@pytest.mark.asyncio
async def test_gemini_stt_transcribe():
    """Mock google.genai.Client and models.generate_content, verify GeminiSTT returns text."""
    mock_response = MagicMock()
    mock_response.text = "Hello, this is the transcription."

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with (
        patch("interviewbot.services.voice_pipeline.get_settings") as mock_settings,
        patch("google.genai.Client", return_value=mock_client),
    ):
        mock_settings.return_value.gemini_api_key = "test-key"
        mock_settings.return_value.gemini_model = "gemini-2.5-flash"

        stt = GeminiSTT()
        result = await stt.transcribe(b"fake-audio-bytes", format="webm")

    assert result == "Hello, this is the transcription."


@pytest.mark.asyncio
async def test_whisper_stt_transcribe():
    """Mock openai.AsyncOpenAI and audio.transcriptions.create, verify WhisperSTT returns text."""
    mock_response = MagicMock()
    mock_response.text = "Whisper transcription result."

    mock_create = AsyncMock(return_value=mock_response)
    mock_audio = MagicMock()
    mock_audio.transcriptions.create = mock_create

    mock_openai_client = MagicMock()
    mock_openai_client.audio = mock_audio

    with (
        patch("interviewbot.services.voice_pipeline.get_settings") as mock_settings,
        patch("openai.AsyncOpenAI", return_value=mock_openai_client),
    ):
        mock_settings.return_value.openai_api_key = "test-key"

        stt = WhisperSTT()
        result = await stt.transcribe(b"fake-audio-bytes", format="webm")

    assert result == "Whisper transcription result."


@pytest.mark.asyncio
async def test_pipeline_prefers_gemini_over_whisper():
    """Mock settings with both keys set, verify GeminiSTT is used."""
    with patch("interviewbot.services.voice_pipeline.get_settings") as mock_settings:
        mock_settings.return_value.gemini_api_key = "gemini-key"
        mock_settings.return_value.openai_api_key = "openai-key"
        mock_settings.return_value.elevenlabs_api_key = ""

        pipeline = VoiceInterviewPipeline()

    assert pipeline.stt is not None
    assert isinstance(pipeline.stt, GeminiSTT)


@pytest.mark.asyncio
async def test_pipeline_falls_back_to_whisper():
    """Mock settings with only openai_api_key, verify WhisperSTT is used."""
    with patch("interviewbot.services.voice_pipeline.get_settings") as mock_settings:
        mock_settings.return_value.gemini_api_key = ""
        mock_settings.return_value.openai_api_key = "openai-key"
        mock_settings.return_value.elevenlabs_api_key = ""

        pipeline = VoiceInterviewPipeline()

    assert pipeline.stt is not None
    assert isinstance(pipeline.stt, WhisperSTT)


@pytest.mark.asyncio
async def test_pipeline_no_stt_raises():
    """Mock settings with no keys, verify process_audio raises RuntimeError."""
    with patch("interviewbot.services.voice_pipeline.get_settings") as mock_settings:
        mock_settings.return_value.gemini_api_key = ""
        mock_settings.return_value.openai_api_key = ""
        mock_settings.return_value.elevenlabs_api_key = ""

        pipeline = VoiceInterviewPipeline()

    with pytest.raises(RuntimeError, match="STT not configured"):
        await pipeline.process_audio(b"fake-audio", format="webm")
