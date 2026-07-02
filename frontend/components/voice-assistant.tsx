"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";

import { BENGALURU_LOCATION, ecoApi } from "@/lib/api";
import type { VoiceResponse } from "@/lib/api";
import { MicIcon, PinIcon, SendIcon } from "@/components/icons";

interface VoiceAssistantProps {
  initialLat: number;
  initialLon: number;
  city?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  dataUsed?: string[];
  confidence?: number;
}

type VoiceState = "idle" | "recording" | "processing" | "speaking";

const EXAMPLE_QUESTIONS = [
  "Is air safe to jog outside?",
  "Any fires near Bengaluru?",
  "Best time to go out today?",
  "How bad is PM2.5 this week?",
  "What's causing high AQI today?",
  "Is my air safe for kids?",
];

async function resolveVoiceLocation(fallbackLat: number, fallbackLon: number, fallbackCity: string) {
  if (!navigator.geolocation) return { lat: fallbackLat, lon: fallbackLon, city: fallbackCity };
  return new Promise<{ lat: number; lon: number; city: string }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, city: fallbackCity }),
      () => resolve({ lat: fallbackLat, lon: fallbackLon, city: fallbackCity }),
      { timeout: 8_000 },
    );
  });
}

function createAssistantMessage(response: VoiceResponse): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text: response.answer,
    dataUsed: response.data_used,
    confidence: response.confidence,
  };
}

function VoiceWaveCanvas({ isActive, analyser, state }: {
  isActive: boolean;
  analyser: AnalyserNode | null;
  state: VoiceState;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = canvas.width = 160;
    let height = canvas.height = 160;

    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      let radius = 54;

      if (analyser && isActive) {
        analyser.getByteFrequencyData(dataArray);
      }

      // Draw glowing background rings
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 4, 0, Math.PI * 2);
      ctx.strokeStyle = state === "recording" ? "rgba(251, 113, 133, 0.1)" : "rgba(76, 215, 246, 0.1)";
      ctx.lineWidth = 6;
      ctx.stroke();

      // Outer wave ring
      ctx.beginPath();
      const points = 80;
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const dataIdx = Math.floor((i / points) * bufferLength);
        let amplitude = 0;
        if (analyser && isActive) {
          amplitude = (dataArray[dataIdx] ?? 0) / 255 * 24;
        } else if (state === "speaking") {
          amplitude = (Math.sin(Date.now() * 0.008 + i * 0.25) * 0.5 + 0.5) * 12;
        } else {
          amplitude = (Math.sin(Date.now() * 0.003 + i * 0.1) * 0.5 + 0.5) * 2;
        }

        const offsetRadius = radius + amplitude;
        const x = centerX + offsetRadius * Math.cos(angle);
        const y = centerY + offsetRadius * Math.sin(angle);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.strokeStyle = state === "recording" ? "rgba(251, 113, 133, 0.8)" : "rgba(76, 215, 246, 0.8)";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.shadowBlur = 12;
      ctx.shadowColor = state === "recording" ? "#fb7185" : "#4cd7f6";
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, analyser, state]);

  return <canvas ref={canvasRef} className="h-40 w-40 absolute pointer-events-none z-0" />;
}

/** Typing indicator with 3 animated dots */
function TypingIndicator() {
  return (
    <div className="flex max-w-[100px] items-center gap-1.5 rounded-[1.2rem] bg-slate-950/35 px-4 py-3">
      {[0, 0.14, 0.28].map((d, i) => (
        <motion.span key={i} className="h-2 w-2 rounded-full bg-slate-400"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 0.9, delay: d }} />
      ))}
    </div>
  );
}

export function VoiceAssistant({ initialLat, initialLon, city = BENGALURU_LOCATION.city }: VoiceAssistantProps) {
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [error, setError]         = useState<string | null>(null);
  const [isTyping, setIsTyping]   = useState(false);
  const [location, setLocation]   = useState({ lat: initialLat, lon: initialLon, city });

  const conversationRef  = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const autoStopRef      = useRef<number | null>(null);
  const audioCtxRef      = useRef<AudioContext | null>(null);
  const analyserRef      = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    void resolveVoiceLocation(initialLat, initialLon, city).then(setLocation);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
      audioCtxRef.current?.close();
    };
  }, [city, initialLat, initialLon]);

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  const currentLabel = useMemo(() => {
    if (voiceState === "recording") return "Listening — speak your question…";
    if (voiceState === "processing") return "Reasoning over live data…";
    if (voiceState === "speaking") return "EcoSentinel is speaking";
    return "Tap the mic or type a question";
  }, [voiceState]);

  async function sendTextQuestion(question: string) {
    if (!question.trim()) return;
    setError(null);
    setVoiceState("processing");
    setIsTyping(true);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: question.trim() }]);

    try {
      const loc = await resolveVoiceLocation(location.lat, location.lon, location.city);
      setLocation(loc);
      const response = await ecoApi.queryText(question.trim(), loc.lat, loc.lon, loc.city);
      setIsTyping(false);
      setMessages((prev) => [...prev, createAssistantMessage(response)]);
      setVoiceState("idle");
    } catch (e) {
      setIsTyping(false);
      setError(e instanceof Error ? e.message : "Voice assistant request failed.");
      setVoiceState("idle");
    }
  }

  async function playAudioResponse(audioBase64?: string) {
    if (!audioBase64) return;
    try {
      setVoiceState("speaking");
      const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
      audio.onended = () => setVoiceState("idle");
      await audio.play();
    } catch { setVoiceState("idle"); }
  }

  async function sendAudioQuestion(blob: Blob) {
    setError(null);
    setVoiceState("processing");
    setIsTyping(true);
    try {
      const loc = await resolveVoiceLocation(location.lat, location.lon, location.city);
      setLocation(loc);
      const formData = new FormData();
      formData.append("audio", blob, "voice-query.webm");
      formData.append("lat", String(loc.lat));
      formData.append("lon", String(loc.lon));
      formData.append("city", loc.city);
      const response = await ecoApi.queryAudio(formData);
      const questionText = response.question_text || response.question || "Voice question";
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", text: questionText },
        createAssistantMessage(response),
      ]);
      await playAudioResponse(response.audio_base64);
      if (!response.audio_base64) setVoiceState("idle");
    } catch (e) {
      setIsTyping(false);
      setError(e instanceof Error ? e.message : "Audio request failed.");
      setVoiceState("idle");
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Audio recording not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up Web Audio API analyser for visualizer
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        audioCtxRef.current?.close(); audioCtxRef.current = null; analyserRef.current = null;
        void sendAudioQuestion(blob);
      };
      recorder.start();
      setVoiceState("recording");
      autoStopRef.current = window.setTimeout(() => stopRecording(), 8_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone permission denied.");
      setVoiceState("idle");
    }
  }

  function stopRecording() {
    if (autoStopRef.current !== null) { window.clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function toggleRecording() {
    if (voiceState === "recording") { stopRecording(); return; }
    await startRecording();
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.95fr_minmax(0,1.05fr)]">
      {/* Mic side */}
      <div className="panel subtle-ring overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-secondary/70">Voice Assistant</p>
              <h2 className="mt-1.5 text-xl font-semibold text-white">Ask live environmental questions</h2>
            </div>
            <div className="rounded-full border border-border bg-slate-950/35 px-3 py-2 text-xs text-slate-200">
              <span className="inline-flex items-center gap-2">
                <PinIcon className="h-3.5 w-3.5" />
                {location.city}
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-h-[560px] flex-col items-center justify-center gap-8 p-6 text-center">
          {/* Big mic button */}
          <motion.button
            type="button"
            id="eco-voice-mic-button"
            onClick={() => void toggleRecording()}
            disabled={voiceState === "processing"}
            className="relative flex h-44 w-44 items-center justify-center rounded-full border text-white transition cursor-pointer"
            style={{ borderColor: voiceState === "recording" ? "rgba(251,113,133,0.4)" : "rgba(76,215,246,0.2)", background: voiceState === "recording" ? "rgba(251,113,133,0.05)" : "rgba(15,29,49,0.45)" }}
            animate={voiceState === "recording" ? { scale: 1.02 } : { scale: [1, 1.015, 1] }}
            transition={voiceState === "recording" ? { repeat: Infinity, duration: 1.4 } : { repeat: Infinity, duration: 3 }}
          >
            {voiceState !== "processing" && (
              <VoiceWaveCanvas
                isActive={voiceState === "recording" || voiceState === "speaking"}
                analyser={analyserRef.current}
                state={voiceState}
              />
            )}

            {voiceState === "processing" ? (
              <motion.div className="h-12 w-12 rounded-full border-2 border-secondary/25 border-t-secondary z-10" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }} />
            ) : (
              <MicIcon className={`h-16 w-16 z-10 transition-colors duration-300 ${voiceState === "recording" ? "text-rose-400" : "text-secondary"}`} />
            )}
          </motion.button>

          <div>
            <motion.p key={voiceState} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-xl font-semibold text-white">
              {currentLabel}
            </motion.p>
            <p className="mt-3 max-w-xs text-sm leading-6 text-slate-400">
              EcoSentinel reasons over live PM2.5, fire activity, waste hotspots, and short-term forecasts.
            </p>
          </div>

          {/* Example chips with stagger */}
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_QUESTIONS.map((q, i) => (
              <motion.button
                key={q}
                type="button"
                onClick={() => void sendTextQuestion(q)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                disabled={voiceState !== "idle"}
                className="rounded-full border border-border bg-slate-950/30 px-3.5 py-2 text-xs text-slate-200 transition hover:border-secondary/35 hover:bg-slate-900 active:scale-95 disabled:opacity-40"
              >
                {q}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Conversation side */}
      <div className="panel subtle-ring overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Conversation</p>
          <h2 className="mt-1.5 text-xl font-semibold text-white">Answers with cited live data sources</h2>
        </div>

        <div className="flex min-h-[560px] flex-col p-5">
          <div ref={conversationRef} className="flex max-h-[420px] flex-1 flex-col gap-4 overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {messages.length ? (
                messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`max-w-[90%] rounded-[1.2rem] px-4 py-3 text-sm leading-7 ${
                      msg.role === "user" ? "ml-auto bg-secondary text-slate-950 shadow" : "bg-slate-950/40 text-slate-100"
                    }`}
                  >
                    <p>{msg.text}</p>
                    {msg.role === "assistant" && (
                      <>
                        {/* Confidence bar */}
                        {msg.confidence !== undefined && (
                          <div className="mt-3">
                            <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                              <span>Confidence</span>
                              <span>{(msg.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <div className="h-1 rounded-full bg-slate-800">
                              <motion.div className="h-1 rounded-full bg-secondary" initial={{ width: 0 }} animate={{ width: `${msg.confidence * 100}%` }} transition={{ duration: 0.6 }} />
                            </div>
                          </div>
                        )}
                        {/* Data source tags */}
                        {msg.dataUsed?.length ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {msg.dataUsed.map((tag) => (
                              <span key={`${msg.id}-${tag}`} className="rounded-full border border-border px-2.5 py-0.5 text-[10px] text-slate-400">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </>
                    )}
                  </motion.div>
                ))
              ) : (
                <div className="flex h-full items-center justify-center rounded-[1.2rem] border border-dashed border-border bg-slate-950/20 px-6 text-center text-sm leading-6 text-slate-500">
                  Start with one of the suggested questions or use the mic.
                </div>
              )}
              {isTyping && (
                <motion.div key="typing" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <TypingIndicator />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form className="mt-4 flex gap-3" onSubmit={(e) => { e.preventDefault(); const q = input; setInput(""); void sendTextQuestion(q); }}>
            <input
              id="eco-voice-text-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a question…"
              disabled={voiceState !== "idle"}
              className="flex-1 rounded-full border border-border bg-slate-950/35 px-4 py-3 text-sm text-white outline-none transition focus:border-secondary/40 disabled:opacity-40"
            />
            <button type="submit" disabled={voiceState !== "idle"}
              className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-secondary/80 active:scale-95 disabled:opacity-40">
              <SendIcon className="h-4 w-4" /> Send
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
