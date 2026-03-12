"""Audio analysis for detecting AI-assisted cheating in voice interviews."""

from __future__ import annotations

import struct
from dataclasses import dataclass, field

import structlog

logger = structlog.get_logger()


@dataclass
class AudioAnalysisResult:
    """Result of audio analysis for anti-cheat detection."""
    response_latencies_ms: list[float] = field(default_factory=list)
    avg_response_latency_ms: float = 0.0
    min_response_latency_ms: float = 0.0
    max_response_latency_ms: float = 0.0
    suspiciously_fast_responses: int = 0
    silence_segments: int = 0
    avg_silence_duration_ms: float = 0.0
    speech_consistency_score: float = 10.0  # 0-10
    audio_flags: list[str] = field(default_factory=list)


FAST_RESPONSE_THRESHOLD_MS = 800  # Sub-800ms is suspiciously fast for complex questions
MIN_NATURAL_PAUSE_MS = 300
UNNATURAL_CONSISTENCY_THRESHOLD = 0.15  # If std_dev of latencies is too low, it's suspicious


def analyze_response_timing(latencies_ms: list[float]) -> AudioAnalysisResult:
    """Analyze response timing patterns for signs of AI assistance.

    AI copilots produce unnaturally consistent response times and
    suspiciously fast answers to complex questions.
    """
    result = AudioAnalysisResult()

    if not latencies_ms:
        return result

    result.response_latencies_ms = latencies_ms
    result.avg_response_latency_ms = sum(latencies_ms) / len(latencies_ms)
    result.min_response_latency_ms = min(latencies_ms)
    result.max_response_latency_ms = max(latencies_ms)

    # Count suspiciously fast responses
    result.suspiciously_fast_responses = sum(
        1 for l in latencies_ms if l < FAST_RESPONSE_THRESHOLD_MS
    )

    # Check response time consistency (humans vary; AI doesn't)
    if len(latencies_ms) >= 3:
        mean = result.avg_response_latency_ms
        variance = sum((x - mean) ** 2 for x in latencies_ms) / len(latencies_ms)
        std_dev = variance ** 0.5
        coefficient_of_variation = std_dev / mean if mean > 0 else 0

        if coefficient_of_variation < UNNATURAL_CONSISTENCY_THRESHOLD:
            result.audio_flags.append("unnaturally_consistent_timing")
            result.speech_consistency_score -= 2.0

    # Flag if too many fast responses
    fast_ratio = result.suspiciously_fast_responses / len(latencies_ms)
    if fast_ratio > 0.5:
        result.audio_flags.append("majority_fast_responses")
        result.speech_consistency_score -= 3.0
    elif fast_ratio > 0.25:
        result.audio_flags.append("frequent_fast_responses")
        result.speech_consistency_score -= 1.5

    # Flag if average is suspiciously low
    if result.avg_response_latency_ms < 1200:
        result.audio_flags.append("very_low_avg_latency")
        result.speech_consistency_score -= 1.5

    result.speech_consistency_score = max(result.speech_consistency_score, 0.0)
    return result


def analyze_audio_energy(audio_bytes: bytes, sample_rate: int = 16000) -> dict:
    """Analyze raw PCM audio for silence patterns and energy distribution.

    Detects:
    - Extended silence (candidate waiting for AI copilot)
    - Sudden volume changes (switching between mic and speaker)
    - Background audio artifacts
    """
    if len(audio_bytes) < 100:
        return {"silence_ratio": 0.0, "energy_spikes": 0, "flags": []}

    # Parse as 16-bit PCM samples
    try:
        num_samples = len(audio_bytes) // 2
        samples = struct.unpack(f"<{num_samples}h", audio_bytes[:num_samples * 2])
    except struct.error:
        return {"silence_ratio": 0.0, "energy_spikes": 0, "flags": []}

    if not samples:
        return {"silence_ratio": 0.0, "energy_spikes": 0, "flags": []}

    # Calculate RMS energy in windows
    window_size = sample_rate // 10  # 100ms windows
    energies = []
    silence_threshold = 500  # RMS below this = silence

    for i in range(0, len(samples), window_size):
        window = samples[i:i + window_size]
        if len(window) < window_size // 2:
            continue
        rms = (sum(s * s for s in window) / len(window)) ** 0.5
        energies.append(rms)

    if not energies:
        return {"silence_ratio": 0.0, "energy_spikes": 0, "flags": []}

    silence_windows = sum(1 for e in energies if e < silence_threshold)
    silence_ratio = silence_windows / len(energies)

    # Detect sudden energy spikes (possible speaker/mic switching)
    avg_energy = sum(energies) / len(energies)
    spikes = sum(1 for e in energies if e > avg_energy * 4)

    flags = []
    if silence_ratio > 0.6:
        flags.append("excessive_silence")
    if spikes > len(energies) * 0.1:
        flags.append("audio_energy_spikes")

    return {
        "silence_ratio": round(silence_ratio, 3),
        "energy_spikes": spikes,
        "avg_energy": round(avg_energy, 1),
        "flags": flags,
    }
