"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { motion } from "framer-motion";

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
  "Any fires near me?",
  "Best time to go out today?",
  "How bad is air quality this week?",
];

async function resolveVoiceLocation(
  fallbackLat: number,
  fallbackLon: number,
  fallbackCity: string,
) {
  if (!navigator.geolocation) {
    return { lat: fallbackLat, lon: fallbackLon, city: fallbackCity };
  }

  return new Promise<{ lat: number; lon: number; city: string }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          city: fallbackCity,
        }),
      () =>
        resolve({
          lat: fallbackLat,
          lon: fallbackLon,
          city: fallbackCity,
        }),
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

export function VoiceAssistant({
  initialLat,
  initialLon,
  city = BENGALURU_LOCATION.city,
}: VoiceAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{
    lat: number;
    lon: number;
    city: string;
  }>({
    lat: initialLat,
    lon: initialLon,
    city,
  });

  const conversationRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopRef = useRef<number | null>(null);

  useEffect(() => {
    void resolveVoiceLocation(initialLat, initialLon, city).then(setLocation);
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (autoStopRef.current !== null) {
        window.clearTimeout(autoStopRef.current);
      }
    };
  }, [city, initialLat, initialLon]);

  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const currentLabel = useMemo(() => {
    if (voiceState === "recording") {
      return "Listening...";
    }
    if (voiceState === "processing") {
      return "Analyzing...";
    }
    if (voiceState === "speaking") {
      return "EcoSentinel is speaking";
    }
    return "Tap the mic or type a question";
  }, [voiceState]);

  async function sendTextQuestion(question: string) {
    if (!question.trim()) {
      return;
    }

    setError(null);
    setVoiceState("processing");
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: question.trim(),
    };
    setMessages((current) => [...current, userMessage]);

    try {
      const currentLocation = await resolveVoiceLocation(
        location.lat,
        location.lon,
        location.city,
      );
      setLocation(currentLocation);

      const response = await ecoApi.queryText(
        question.trim(),
        currentLocation.lat,
        currentLocation.lon,
        currentLocation.city,
      );
      setMessages((current) => [...current, createAssistantMessage(response)]);
      setVoiceState("idle");
    } catch (queryError) {
      const message =
        queryError instanceof Error
          ? queryError.message
          : "Voice assistant request failed.";
      setError(message);
      setVoiceState("idle");
    }
  }

  async function playAudioResponse(audioBase64?: string) {
    if (!audioBase64) {
      return;
    }

    try {
      setVoiceState("speaking");
      const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
      audio.onended = () => setVoiceState("idle");
      await audio.play();
    } catch {
      setVoiceState("idle");
    }
  }

  async function sendAudioQuestion(blob: Blob) {
    setError(null);
    setVoiceState("processing");

    try {
      const currentLocation = await resolveVoiceLocation(
        location.lat,
        location.lon,
        location.city,
      );
      setLocation(currentLocation);

      const formData = new FormData();
      formData.append("audio", blob, "voice-query.webm");
      formData.append("lat", String(currentLocation.lat));
      formData.append("lon", String(currentLocation.lon));
      formData.append("city", currentLocation.city);

      const response = await ecoApi.queryAudio(formData);
      const questionText = response.question_text || response.question || "Voice question";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "user",
          text: questionText,
        },
        createAssistantMessage(response),
      ]);
      await playAudioResponse(response.audio_base64);
      if (!response.audio_base64) {
        setVoiceState("idle");
      }
    } catch (audioError) {
      const message =
        audioError instanceof Error
          ? audioError.message
          : "Audio request failed.";
      setError(message);
      setVoiceState("idle");
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Audio recording is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        void sendAudioQuestion(blob);
      };

      recorder.start();
      setVoiceState("recording");

      autoStopRef.current = window.setTimeout(() => {
        stopRecording();
      }, 6_000);
    } catch (recordError) {
      const message =
        recordError instanceof Error
          ? recordError.message
          : "Microphone permission denied.";
      setError(message);
      setVoiceState("idle");
    }
  }

  function stopRecording() {
    if (autoStopRef.current !== null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  async function toggleRecording() {
    if (voiceState === "recording") {
      stopRecording();
      return;
    }
    await startRecording();
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.95fr_minmax(0,1.05fr)]">
      <div className="panel subtle-ring overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-sky-200/70">
                Voice Assistant
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Ask live environmental questions in plain language
              </h2>
            </div>
            <div className="rounded-full border border-border bg-slate-950/35 px-3 py-2 text-sm text-slate-200">
              <span className="inline-flex items-center gap-2">
                <PinIcon className="h-4 w-4" />
                {location.city} · {location.lat.toFixed(3)}, {location.lon.toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-h-[560px] flex-col items-center justify-center gap-8 p-6 text-center">
          <motion.button
            type="button"
            onClick={() => void toggleRecording()}
            className="relative flex h-44 w-44 items-center justify-center rounded-full border border-sky-300/30 bg-slate-950/30 text-white shadow-[0_20px_80px_rgba(56,189,248,0.12)]"
            animate={
              voiceState === "recording"
                ? { boxShadow: ["0 0 0 0 rgba(251,113,133,0.2)", "0 0 0 24px rgba(251,113,133,0)", "0 0 0 0 rgba(251,113,133,0)"] }
                : voiceState === "processing"
                  ? { rotate: 360 }
                  : { scale: [1, 1.03, 1] }
            }
            transition={
              voiceState === "processing"
                ? { repeat: Number.POSITIVE_INFINITY, duration: 1.6, ease: "linear" }
                : { repeat: Number.POSITIVE_INFINITY, duration: 2.4 }
            }
          >
            {voiceState === "speaking" ? (
              <div className="flex items-end gap-1">
                {[20, 28, 38, 28, 20].map((height, index) => (
                  <motion.span
                    key={height}
                    className="w-2 rounded-full bg-sky-300"
                    animate={{ height: [height / 2, height, height / 2] }}
                    transition={{
                      repeat: Number.POSITIVE_INFINITY,
                      duration: 0.9,
                      delay: index * 0.08,
                    }}
                    style={{ height }}
                  />
                ))}
              </div>
            ) : (
              <MicIcon
                className={`h-16 w-16 ${
                  voiceState === "recording" ? "text-rose-300" : "text-sky-200"
                }`}
              />
            )}
          </motion.button>

          <div>
            <p className="text-2xl font-semibold text-white">{currentLabel}</p>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
              EcoSentinel can reason over live PM2.5 readings, fire activity,
              waste hotspots, and short-term forecasts.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => void sendTextQuestion(question)}
                className="rounded-full border border-border bg-slate-950/30 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-300/35 hover:bg-slate-900"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel subtle-ring overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
            Conversation
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Voice and text answers with cited live data sources
          </h2>
        </div>

        <div className="flex min-h-[560px] flex-col p-5">
          <div
            ref={conversationRef}
            className="flex max-h-[420px] flex-1 flex-col gap-4 overflow-y-auto pr-1"
          >
            {messages.length ? (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[88%] rounded-[1.2rem] px-4 py-3 text-sm leading-7 ${
                    message.role === "user"
                      ? "ml-auto bg-sky-400 text-slate-950"
                      : "bg-slate-950/35 text-slate-100"
                  }`}
                >
                  <p>{message.text}</p>
                  {message.role === "assistant" && message.dataUsed?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.dataUsed.map((tag) => (
                        <span
                          key={`${message.id}-${tag}`}
                          className="rounded-full border border-border px-2.5 py-1 text-xs text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="flex h-full items-center justify-center rounded-[1.2rem] border border-dashed border-border bg-slate-950/25 px-6 text-center text-sm leading-6 text-slate-400">
                Start with one of the suggested questions or use the mic to ask
                about air quality, fires, waste, or short-term predictions.
              </div>
            )}
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <form
            className="mt-4 flex gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const nextQuestion = input;
              setInput("");
              void sendTextQuestion(nextQuestion);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type a question instead..."
              className="flex-1 rounded-full border border-border bg-slate-950/35 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300/40"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-full bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
            >
              <SendIcon className="h-4 w-4" />
              Send
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
