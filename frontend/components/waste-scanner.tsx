"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { motion } from "framer-motion";

import type { WasteClassification, WasteImpactStats } from "@/lib/api";
import { BENGALURU_LOCATION, ecoApi } from "@/lib/api";
import { clamp, getImpactTone } from "@/lib/environment";
import { CameraIcon, UploadIcon, WasteIcon } from "@/components/icons";

interface WasteScannerProps {
  initialLat: number;
  initialLon: number;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Unable to create photo blob."));
    }, "image/jpeg", 0.92);
  });
}

async function resolvePosition() {
  if (!navigator.geolocation) {
    return BENGALURU_LOCATION;
  }

  return new Promise<{ lat: number; lon: number; city: string }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          city: BENGALURU_LOCATION.city,
        }),
      () => resolve({ ...BENGALURU_LOCATION }),
      { enableHighAccuracy: true, timeout: 8_000 },
    );
  });
}

export function WasteScanner({ initialLat, initialLon }: WasteScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [classification, setClassification] = useState<WasteClassification | null>(null);
  const [impactStats, setImpactStats] = useState<WasteImpactStats>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [position, setPosition] = useState<{
    lat: number;
    lon: number;
    city: string;
  }>({
    lat: initialLat,
    lon: initialLon,
    city: BENGALURU_LOCATION.city,
  });

  useEffect(() => {
    void ecoApi
      .getWasteImpactStats()
      .then(setImpactStats)
      .catch(() => setImpactStats({}));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
        setError("Camera access is not available in this browser.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setError(null);
      } catch (cameraError) {
        const message =
          cameraError instanceof Error
            ? cameraError.message
            : "Camera permission was denied.";
        setError(message);
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const decompositionYears = classification
    ? impactStats[classification.waste_type]?.decompose_years ?? 0
    : 0;

  const decompositionWidth = useMemo(() => {
    if (!decompositionYears) {
      return 0;
    }
    return clamp(Math.log10(decompositionYears + 1) * 26, 10, 100);
  }, [decompositionYears]);

  async function analyzeBlob(blob: Blob) {
    setIsAnalyzing(true);
    setStatus("Analyzing with Gemini Vision...");
    setError(null);

    try {
      const currentPosition = await resolvePosition();
      setPosition(currentPosition);

      const formData = new FormData();
      formData.append("image", blob, "waste-scan.jpg");
      formData.append("lat", String(currentPosition.lat));
      formData.append("lon", String(currentPosition.lon));

      const response = await ecoApi.classifyWasteImage(formData);
      setClassification(response);
      setStatus("Classification complete.");
    } catch (scanError) {
      const message =
        scanError instanceof Error
          ? scanError.message
          : "Waste analysis failed.";
      setError(message);
      setStatus(null);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleTakePhoto() {
    if (!videoRef.current || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");

    if (!context) {
      setError("Canvas is not available for capture.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas);

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = URL.createObjectURL(blob);
    setPreviewUrl(previewUrlRef.current);
    await analyzeBlob(blob);
  }

  async function handleUploadChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = URL.createObjectURL(file);
    setPreviewUrl(previewUrlRef.current);
    await analyzeBlob(file);
    event.target.value = "";
  }

  async function handleReportHotspot() {
    if (!classification) {
      return;
    }

    try {
      await ecoApi.reportHotspot({
        lat: position.lat,
        lon: position.lon,
        waste_type: classification.waste_type,
        severity: clamp(Math.round(classification.environmental_impact_score / 2), 1, 5),
        image_url: null,
      });
      setStatus("Hotspot reported successfully.");
    } catch (reportError) {
      const message =
        reportError instanceof Error
          ? reportError.message
          : "Unable to report hotspot.";
      setError(message);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.1fr_minmax(0,0.9fr)]">
      <div className="panel subtle-ring overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-200/70">
            Waste Scanner
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Capture an item and connect it to local air conditions
          </h2>
        </div>

        <div className="space-y-4 p-5">
          <div className="relative overflow-hidden rounded-[1.35rem] border border-border bg-slate-950/40">
            {previewUrl ? (
              <div className="relative h-[380px] w-full">
                <Image
                  src={previewUrl}
                  alt="Captured waste preview"
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : (
              <video
                ref={videoRef}
                muted
                playsInline
                className="h-[380px] w-full bg-slate-950 object-cover"
              />
            )}

            {!previewUrl && !error ? (
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(15,23,42,0.05)_50%,transparent_100%)]">
                <div className="absolute inset-6 rounded-[1.2rem] border border-dashed border-sky-300/30" />
                <div className="absolute inset-0 animate-pulse bg-[linear-gradient(180deg,transparent,rgba(56,189,248,0.04),transparent)]" />
                <div className="absolute bottom-5 left-5 rounded-full bg-slate-950/75 px-4 py-2 text-sm text-slate-100">
                  Point camera at waste or upload an image
                </div>
              </div>
            ) : null}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleTakePhoto()}
              className="inline-flex items-center gap-2 rounded-full bg-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
            >
              <CameraIcon className="h-4 w-4" />
              Take Photo
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-slate-950/35 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-sky-300/35 hover:bg-slate-900"
            >
              <UploadIcon className="h-4 w-4" />
              Upload Image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void handleUploadChange(event)}
            />
          </div>

          {status ? (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {status}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel subtle-ring overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
            Classification Result
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Environmental impact and disposal guide
          </h2>
        </div>

        <div className="space-y-4 p-5">
          {isAnalyzing ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-6 rounded-[1.2rem] border border-border bg-slate-950/35 px-6 text-center">
              <motion.div
                className="h-16 w-16 rounded-full border-2 border-sky-300/35 border-t-sky-300"
                animate={{ rotate: 360 }}
                transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.1, ease: "linear" }}
              />
              <div>
                <p className="text-lg font-semibold text-white">
                  Analyzing with AI...
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  The scanner is classifying waste, estimating impact, and
                  checking air-quality context nearby.
                </p>
              </div>
            </div>
          ) : classification ? (
            <div className="space-y-4">
              <div className="rounded-[1.2rem] border border-border bg-slate-950/35 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      Waste type
                    </p>
                    <h3
                      className="mt-3 text-3xl font-semibold uppercase"
                      style={{ color: getImpactTone(classification.environmental_impact_score) }}
                    >
                      {classification.waste_type}
                    </h3>
                  </div>
                  <div className="rounded-full border border-border px-4 py-2 text-sm text-slate-200">
                    {(classification.confidence * 100).toFixed(0)}% confidence
                  </div>
                </div>
                <div className="mt-4 h-3 rounded-full bg-slate-800">
                  <div
                    className="h-3 rounded-full"
                    style={{
                      width: `${clamp(classification.confidence * 100, 5, 100)}%`,
                      backgroundColor: getImpactTone(classification.environmental_impact_score),
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.2rem] border border-border bg-slate-950/35 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                    Impact score
                  </p>
                  <div className="mt-5 flex items-center gap-5">
                    <div className="relative h-24 w-24">
                      <svg viewBox="0 0 120 120" className="h-24 w-24">
                        <path
                          d="M20 88a40 40 0 0 1 80 0"
                          stroke="rgba(148,163,184,0.18)"
                          strokeWidth="14"
                          fill="none"
                          strokeLinecap="round"
                        />
                        <path
                          d="M20 88a40 40 0 0 1 80 0"
                          stroke={getImpactTone(classification.environmental_impact_score)}
                          strokeWidth="14"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={`${classification.environmental_impact_score * 12.6} 200`}
                        />
                      </svg>
                      <div className="absolute inset-x-0 bottom-0 text-center text-2xl font-semibold text-white">
                        {classification.environmental_impact_score.toFixed(1)}
                      </div>
                    </div>
                    <p className="text-sm leading-6 text-slate-400">
                      Higher scores mean the item is more harmful when dumped,
                      burned, or left mixed with general waste.
                    </p>
                  </div>
                </div>

                <div className="rounded-[1.2rem] border border-border bg-slate-950/35 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                    Decomposition timeline
                  </p>
                  <p className="mt-4 text-3xl font-semibold text-white">
                    {decompositionYears || "--"} years
                  </p>
                  <div className="mt-4 h-3 rounded-full bg-slate-800">
                    <div
                      className="h-3 rounded-full"
                      style={{
                        width: `${decompositionWidth}%`,
                        backgroundColor: getImpactTone(classification.environmental_impact_score),
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[1.2rem] border border-border bg-slate-950/35 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Local air-quality context
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {classification.local_air_quality_correlation}
                </p>
              </div>

              <div className="rounded-[1.2rem] border border-border bg-slate-950/35 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Disposal guide
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {classification.disposal_recommendation}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleReportHotspot()}
                className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
              >
                <WasteIcon className="h-4 w-4" />
                Report as hotspot
              </button>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-5 rounded-[1.2rem] border border-dashed border-border bg-slate-950/35 px-6 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-900/80 text-sky-200">
                <WasteIcon className="h-9 w-9" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Scanner ready
                </h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                  Capture or upload a waste item to generate a class, an impact
                  score, decomposition timeline, and disposal recommendation.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
