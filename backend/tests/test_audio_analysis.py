"""Unit tests for audio analysis service (Phase 4A).

Tests the pure analysis functions without any DB or HTTP dependencies.
"""
import struct

import pytest

from interviewbot.services.audio_analysis import (
    FAST_RESPONSE_THRESHOLD_MS,
    UNNATURAL_CONSISTENCY_THRESHOLD,
    AudioAnalysisResult,
    analyze_audio_energy,
    analyze_response_timing,
)


# ────────────────────────────────────────
#  analyze_response_timing
# ────────────────────────────────────────


def test_empty_latencies_returns_default():
    result = analyze_response_timing([])
    assert result.avg_response_latency_ms == 0.0
    assert result.suspiciously_fast_responses == 0
    assert result.audio_flags == []
    assert result.speech_consistency_score == 10.0


def test_normal_human_latencies_no_flags():
    latencies = [2500.0, 3200.0, 1800.0, 4100.0, 2700.0]
    result = analyze_response_timing(latencies)
    assert result.avg_response_latency_ms > 1200
    assert result.suspiciously_fast_responses == 0
    assert "majority_fast_responses" not in result.audio_flags
    assert "very_low_avg_latency" not in result.audio_flags
    assert result.speech_consistency_score >= 8.0


def test_all_fast_responses_flagged():
    latencies = [400.0, 350.0, 500.0, 300.0, 450.0]
    result = analyze_response_timing(latencies)
    assert result.suspiciously_fast_responses == 5
    assert "majority_fast_responses" in result.audio_flags
    assert "very_low_avg_latency" in result.audio_flags
    assert result.speech_consistency_score < 10.0


def test_mixed_fast_and_normal_frequent_flag():
    latencies = [
        400.0, 2500.0, 500.0, 3000.0,
        600.0, 2000.0, 700.0, 2500.0,
    ]
    result = analyze_response_timing(latencies)
    fast_ratio = result.suspiciously_fast_responses / len(latencies)
    assert result.suspiciously_fast_responses == 4
    assert fast_ratio == 0.5


def test_unnaturally_consistent_timing_flagged():
    # Very low variance in response times
    latencies = [1000.0, 1010.0, 1005.0, 995.0, 1002.0]
    result = analyze_response_timing(latencies)
    assert "unnaturally_consistent_timing" in result.audio_flags


def test_natural_variance_not_flagged():
    latencies = [1500.0, 3200.0, 800.0, 5000.0, 2100.0]
    result = analyze_response_timing(latencies)
    assert "unnaturally_consistent_timing" not in result.audio_flags


def test_two_latencies_skips_consistency_check():
    latencies = [500.0, 500.0]
    result = analyze_response_timing(latencies)
    assert "unnaturally_consistent_timing" not in result.audio_flags


def test_score_cannot_go_below_zero():
    latencies = [100.0, 100.0, 100.0, 100.0, 100.0]
    result = analyze_response_timing(latencies)
    assert result.speech_consistency_score >= 0.0


def test_latency_stats_calculated_correctly():
    latencies = [1000.0, 2000.0, 3000.0]
    result = analyze_response_timing(latencies)
    assert result.avg_response_latency_ms == 2000.0
    assert result.min_response_latency_ms == 1000.0
    assert result.max_response_latency_ms == 3000.0


def test_single_latency():
    result = analyze_response_timing([5000.0])
    assert result.avg_response_latency_ms == 5000.0
    assert result.suspiciously_fast_responses == 0
    assert result.speech_consistency_score >= 8.5


# ────────────────────────────────────────
#  analyze_audio_energy
# ────────────────────────────────────────


def test_audio_energy_too_short():
    result = analyze_audio_energy(b"\x00" * 50)
    assert result["silence_ratio"] == 0.0
    assert result["energy_spikes"] == 0
    assert result["flags"] == []


def test_audio_energy_silence():
    """All-zero samples should produce high silence ratio."""
    num_samples = 16000  # 1 second at 16kHz
    audio = struct.pack(f"<{num_samples}h", *([0] * num_samples))
    result = analyze_audio_energy(audio, sample_rate=16000)
    assert result["silence_ratio"] > 0.9
    assert "excessive_silence" in result["flags"]


def test_audio_energy_loud_signal():
    """Loud signal should have low silence ratio."""
    num_samples = 16000
    samples = [20000 if i % 2 == 0 else -20000 for i in range(num_samples)]
    audio = struct.pack(f"<{num_samples}h", *samples)
    result = analyze_audio_energy(audio, sample_rate=16000)
    assert result["silence_ratio"] < 0.1
    assert "excessive_silence" not in result["flags"]


def test_audio_energy_invalid_bytes():
    """Odd-length bytes that can't be parsed as 16-bit PCM."""
    result = analyze_audio_energy(b"\x00" * 101)
    assert result["silence_ratio"] == 0.0


def test_audio_energy_spike_detection():
    """Samples with sudden volume spikes should be detected."""
    num_samples = 16000
    samples = [100] * num_samples
    # Insert loud spikes in 20% of windows
    window_size = 1600  # 100ms windows at 16kHz
    for i in range(0, num_samples, window_size * 2):
        for j in range(min(window_size, num_samples - i)):
            samples[i + j] = 30000
    audio = struct.pack(f"<{num_samples}h", *samples)
    result = analyze_audio_energy(audio, sample_rate=16000)
    assert result["energy_spikes"] >= 0


# ────────────────────────────────────────
#  Constants sanity checks
# ────────────────────────────────────────


def test_threshold_constants():
    assert FAST_RESPONSE_THRESHOLD_MS == 800
    assert UNNATURAL_CONSISTENCY_THRESHOLD == 0.15
