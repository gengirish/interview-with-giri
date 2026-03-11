"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  Mic,
  MicOff,
  Loader2,
  Clock,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "loading" | "consent" | "ready" | "interview" | "completed" | "error";
type TranscriptEntry = { role: "interviewer" | "candidate"; content: string };

export default function VoiceInterviewPage() {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [jobTitle, setJobTitle] = useState("");
  const [error, setError] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(10);
  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getPublicInterview(token);
        if (data.status === "completed") {
          setPhase("completed");
          return;
        }
        setJobTitle(data.job_title as string || "");
        setTotal((data.interview_config as Record<string, number>)?.num_questions || 10);
        setPhase("consent");
      } catch {
        setError("Interview not found.");
        setPhase("error");
      }
    }
    load();
  }, [token]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, thinking]);

  async function handleConsent(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.startInterview(token, {
        candidate_name: candidateName,
        candidate_email: candidateEmail,
      });
      setPhase("ready");
    } catch {
      setError("Failed to start interview.");
      setPhase("error");
    }
  }

  const connectWebSocket = useCallback(() => {
    const wsUrl =
      (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8001") +
      `/ws/voice-interview/${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "audio_response") {
        setTranscript((t) => [
          ...t,
          { role: "interviewer", content: data.text },
        ]);
        setThinking(false);
        setProgress(data.progress || 0);
        setTotal(data.total || 10);
        playAudio(data.audio);
      } else if (data.type === "question") {
        setTranscript((t) => [
          ...t,
          { role: "interviewer", content: data.content },
        ]);
        setThinking(false);
        setProgress(data.progress || 0);
      } else if (data.type === "transcript") {
        setTranscript((t) => [
          ...t,
          { role: "candidate", content: data.content },
        ]);
      } else if (data.type === "thinking") {
        setThinking(true);
      } else if (data.type === "end") {
        const content = data.text || data.content || "";
        if (content) {
          setTranscript((t) => [
            ...t,
            { role: "interviewer", content },
          ]);
        }
        if (data.audio) playAudio(data.audio);
        setPhase("completed");
        ws.close();
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (data.type === "error") {
        setError(data.content);
        setPhase("error");
      }
    };

    ws.onerror = () => {
      setError("Connection error. Please refresh.");
      setPhase("error");
    };

    ws.onclose = () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token]);

  function playAudio(base64Audio: string) {
    const audioBytes = Uint8Array.from(atob(base64Audio), (c) =>
      c.charCodeAt(0),
    );
    const blob = new Blob([audioBytes], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    setIsPlaying(true);
    audio.onended = () => {
      setIsPlaying(false);
      URL.revokeObjectURL(url);
    };
    audio.play().catch(() => setIsPlaying(false));
  }

  function startInterview() {
    setPhase("interview");
    connectWebSocket();
  }

  async function toggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const recorder = new MediaRecorder(stream, {
          mimeType: "audio/webm;codecs=opus",
        });
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          wsRef.current?.send(
            JSON.stringify({
              type: "audio",
              data: base64,
              format: "webm",
            }),
          );

          stream.getTracks().forEach((t) => t.stop());
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
      } catch {
        setError("Microphone access denied.");
      }
    }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }

  if (phase === "loading")
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
      </div>
    );

  if (phase === "error")
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
          <h2 className="mt-4 text-xl font-bold text-white">Error</h2>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
        </div>
      </div>
    );

  if (phase === "completed")
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-400" />
          <h2 className="mt-4 text-xl font-bold text-white">Interview Complete</h2>
          <p className="mt-2 text-sm text-slate-400">
            Thank you! Your responses have been recorded.
          </p>
        </div>
      </div>
    );

  if (phase === "consent")
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Mic className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Voice Interview</h1>
              <p className="text-xs text-slate-400">{jobTitle}</p>
            </div>
          </div>

          <form onSubmit={handleConsent} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="rounded-lg bg-slate-800/50 p-3 text-xs text-slate-400">
              <p className="font-medium text-slate-300 mb-1">Requirements:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Microphone access is required</li>
                <li>Find a quiet environment</li>
                <li>Speak clearly and at a natural pace</li>
              </ul>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    );

  if (phase === "ready")
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
          <Mic className="mx-auto h-12 w-12 text-indigo-400" />
          <h2 className="mt-4 text-xl font-bold text-white">Ready</h2>
          <p className="mt-2 text-sm text-slate-400">
            The AI will speak questions. Press the mic button to record your answer.
          </p>
          <button
            onClick={startInterview}
            className="mt-6 rounded-lg bg-indigo-600 px-8 py-3 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Start Voice Interview
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex h-screen flex-col bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Mic className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">{jobTitle}</h1>
            <p className="text-xs text-slate-500">Voice Interview</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isPlaying && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-400">
              <Volume2 className="h-3.5 w-3.5 animate-pulse" />
              Speaking
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            {formatTime(elapsed)}
          </div>
          <div className="text-xs text-slate-500">
            Q {progress}/{total}
          </div>
        </div>
      </header>

      <div className="h-1 bg-slate-800">
        <div
          className="h-full bg-indigo-600 transition-all duration-500"
          style={{ width: `${(progress / total) * 100}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {transcript.map((entry, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                entry.role === "candidate" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                  entry.role === "candidate"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-slate-800 text-slate-200 rounded-bl-sm",
                )}
              >
                {entry.content}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-800 px-4 py-3 rounded-bl-sm">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" />
                  <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      <div className="border-t border-slate-800 px-4 py-6">
        <div className="flex items-center justify-center">
          <button
            onClick={toggleRecording}
            disabled={thinking || isPlaying}
            className={cn(
              "rounded-full p-6 transition-all",
              isRecording
                ? "bg-red-600 hover:bg-red-700 animate-pulse"
                : "bg-indigo-600 hover:bg-indigo-700",
              (thinking || isPlaying) && "opacity-50 cursor-not-allowed",
            )}
          >
            {isRecording ? (
              <MicOff className="h-8 w-8 text-white" />
            ) : (
              <Mic className="h-8 w-8 text-white" />
            )}
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">
          {isRecording
            ? "Recording... Click to stop and send"
            : thinking
              ? "Processing your response..."
              : isPlaying
                ? "AI is speaking..."
                : "Click to start recording your answer"}
        </p>
      </div>
    </div>
  );
}
