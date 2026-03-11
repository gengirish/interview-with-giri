"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle,
  MonitorUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "loading" | "consent" | "setup" | "interview" | "completed" | "error";
type TranscriptEntry = { role: "interviewer" | "candidate"; content: string };

export default function VideoInterviewPage() {
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
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
  }, [transcript]);

  async function handleConsent(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.startInterview(token, {
        candidate_name: candidateName,
        candidate_email: candidateEmail,
      });
      await setupMedia();
      setPhase("setup");
    } catch {
      setError("Failed to start interview.");
      setPhase("error");
    }
  }

  async function setupMedia() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setError("Camera/microphone access denied.");
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

      if (data.type === "audio_response" || data.type === "question") {
        const content = data.text || data.content || "";
        setTranscript((t) => [...t, { role: "interviewer", content }]);
        setThinking(false);
        setProgress(data.progress || 0);
        if (data.audio) {
          const audioBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
          const blob = new Blob([audioBytes], { type: "audio/mpeg" });
          const audio = new Audio(URL.createObjectURL(blob));
          audio.play().catch(() => {});
        }
      } else if (data.type === "transcript") {
        setTranscript((t) => [...t, { role: "candidate", content: data.content }]);
      } else if (data.type === "thinking") {
        setThinking(true);
      } else if (data.type === "end") {
        const content = data.text || data.content || "";
        if (content) setTranscript((t) => [...t, { role: "interviewer", content }]);
        setPhase("completed");
        ws.close();
        if (timerRef.current) clearInterval(timerRef.current);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } else if (data.type === "error") {
        setError(data.content);
        setPhase("error");
      }
    };

    ws.onerror = () => {
      setError("Connection error.");
      setPhase("error");
    };
    ws.onclose = () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token]);

  function startInterview() {
    setPhase("interview");
    connectWebSocket();
  }

  async function toggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      const stream = streamRef.current;
      if (!stream) return;

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;

      const audioStream = new MediaStream([audioTrack]);
      const recorder = new MediaRecorder(audioStream, {
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
          JSON.stringify({ type: "audio", data: base64, format: "webm" }),
        );
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    }
  }

  function toggleMute() {
    const stream = streamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
      setIsMuted(!isMuted);
    }
  }

  function toggleVideo() {
    const stream = streamRef.current;
    if (stream) {
      stream.getVideoTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
      setIsVideoOff(!isVideoOff);
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
              <Video className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Video Interview</h1>
              <p className="text-xs text-slate-400">{jobTitle}</p>
            </div>
          </div>
          <form onSubmit={handleConsent} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                required
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div className="rounded-lg bg-slate-800/50 p-3 text-xs text-slate-400">
              <p className="font-medium text-slate-300 mb-1">Requirements:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Camera and microphone access required</li>
                <li>Your video will be recorded</li>
                <li>Find a well-lit, quiet environment</li>
              </ul>
            </div>
            <button type="submit" className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
              Continue
            </button>
          </form>
        </div>
      </div>
    );

  if (phase === "setup")
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
        <div className="max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center">
          <div className="relative mx-auto w-80 h-60 rounded-xl overflow-hidden bg-slate-800 mb-6">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          </div>
          <h2 className="text-xl font-bold text-white">Camera Check</h2>
          <p className="mt-2 text-sm text-slate-400">
            Make sure you can see yourself clearly. Click start when ready.
          </p>
          <button
            onClick={startInterview}
            className="mt-6 rounded-lg bg-indigo-600 px-8 py-3 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Start Video Interview
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Video + Controls */}
      <div className="flex w-1/3 flex-col border-r border-slate-800">
        <div className="relative flex-1 bg-slate-800">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "h-full w-full object-cover",
              isVideoOff && "hidden",
            )}
          />
          {isVideoOff && (
            <div className="flex h-full items-center justify-center">
              <VideoOff className="h-16 w-16 text-slate-600" />
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950/80 p-4">
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={toggleMute}
                className={cn(
                  "rounded-full p-3 transition-colors",
                  isMuted ? "bg-red-600" : "bg-slate-700 hover:bg-slate-600",
                )}
              >
                {isMuted ? (
                  <MicOff className="h-5 w-5 text-white" />
                ) : (
                  <Mic className="h-5 w-5 text-white" />
                )}
              </button>
              <button
                onClick={toggleVideo}
                className={cn(
                  "rounded-full p-3 transition-colors",
                  isVideoOff ? "bg-red-600" : "bg-slate-700 hover:bg-slate-600",
                )}
              >
                {isVideoOff ? (
                  <VideoOff className="h-5 w-5 text-white" />
                ) : (
                  <Video className="h-5 w-5 text-white" />
                )}
              </button>
              <button
                onClick={toggleRecording}
                disabled={thinking}
                className={cn(
                  "rounded-full p-3 transition-all",
                  isRecording
                    ? "bg-red-600 animate-pulse"
                    : "bg-indigo-600 hover:bg-indigo-700",
                  thinking && "opacity-50",
                )}
              >
                {isRecording ? (
                  <MicOff className="h-5 w-5 text-white" />
                ) : (
                  <Mic className="h-5 w-5 text-white" />
                )}
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-slate-400">
              {isRecording ? "Recording... Click to send" : "Click mic to answer"}
            </p>
          </div>
        </div>
      </div>

      {/* Transcript */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="text-sm font-semibold text-white">{jobTitle}</div>
          <div className="flex items-center gap-4">
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

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
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
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
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
    </div>
  );
}
