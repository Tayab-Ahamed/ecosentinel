"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";

import type { LeaderboardEntry, WasteClassification, WasteHotspotProperties, WasteImpactStats } from "@/lib/api";
import { BENGALURU_LOCATION, ecoApi } from "@/lib/api";
import { clamp, getImpactTone } from "@/lib/environment";
import { CameraIcon, UploadIcon, WasteIcon } from "@/components/icons";

interface WasteScannerProps {
  initialLat: number;
  initialLon: number;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Cannot create photo blob."))),
      "image/jpeg",
      0.92,
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function resolvePosition() {
  if (!navigator.geolocation) return BENGALURU_LOCATION;
  return new Promise<{ lat: number; lon: number; city: string }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, city: BENGALURU_LOCATION.city }),
      () => resolve({ ...BENGALURU_LOCATION }),
      { enableHighAccuracy: true, timeout: 8_000 },
    );
  });
}

function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    const rotateX = -(y - yc) / 22;
    const rotateY = (x - xc) / 22;
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`;
  };

  const handleMouseLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`transition-all duration-200 ease-out ${className || ""}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      {children}
    </div>
  );
}

const WASTE_EMOJI: Record<string, string> = {
  plastic: "🧴", paper: "📄", glass: "🫙", metal: "🔩",
  ewaste: "💻", medical: "💊", construction: "🧱", organic: "🌿",
  hazardous: "☣️", mixed: "♻️", unknown: "❓",
};

export function WasteScanner({ initialLat, initialLon }: WasteScannerProps) {
  const videoRef   = useRef<HTMLVideoElement | null>(null);
  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [activeTab, setActiveTab]           = useState<"scan" | "leaderboard">("scan");
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null);
  const [imageBase64, setImageBase64]       = useState<string | null>(null);
  const [classification, setClassification] = useState<WasteClassification | null>(null);
  const [impactStats, setImpactStats]       = useState<WasteImpactStats>({});
  const [status, setStatus]                 = useState<string | null>(null);
  const [error, setError]                   = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing]       = useState(false);
  const [hotspotReported, setHotspotReported] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lon: number; city: string }>({ lat: initialLat, lon: initialLon, city: BENGALURU_LOCATION.city });

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activeHotspots, setActiveHotspots] = useState<WasteHotspotProperties[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  useEffect(() => {
    void ecoApi.getWasteImpactStats().then(setImpactStats).catch(() => setImpactStats({}));
  }, []);

  const fetchLeaderboardData = useCallback(async () => {
    setLoadingLeaderboard(true);
    try {
      const [board, spots] = await Promise.all([
        ecoApi.getLeaderboard(),
        ecoApi.getWasteHotspots(),
      ]);
      setLeaderboard(board);
      // Filter to only active spots
      const activeOnly = spots.features
        .map((f) => f.properties)
        .filter((h) => h.status === "active");
      setActiveHotspots(activeOnly);
    } catch (e) {
      console.error("Failed to load leaderboard stats:", e);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "leaderboard") {
      const timer = setTimeout(() => {
        void fetchLeaderboardData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeTab, fetchLeaderboardData]);

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      if (activeTab !== "scan") return;
      if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
        setError("Camera access unavailable in this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Camera permission denied.");
      }
    }
    void startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [activeTab]);

  const decompositionYears = classification ? (impactStats[classification.waste_type]?.decompose_years ?? 0) : 0;
  const decompositionWidth = useMemo(() => {
    if (!decompositionYears) return 0;
    return clamp(Math.log10(decompositionYears + 1) * 26, 10, 100);
  }, [decompositionYears]);

  async function analyzeBlob(blob: Blob) {
    setIsAnalyzing(true);
    setStatus("Analyzing with Gemini Vision…");
    setError(null);
    setHotspotReported(false);
    try {
      const pos = await resolvePosition();
      setPosition(pos);

      // Convert to base64 for persistent DB reporting
      const base64Str = await blobToBase64(blob);
      setImageBase64(base64Str);

      const formData = new FormData();
      formData.append("image", blob, "waste-scan.jpg");
      formData.append("lat", String(pos.lat));
      formData.append("lon", String(pos.lon));
      
      const result = await ecoApi.classifyWasteImage(formData);
      setClassification(result);
      setStatus("Classification complete ✓");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Waste analysis failed.");
      setStatus(null);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleTakePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setError("Canvas not available."); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(blob);
    setPreviewUrl(previewUrlRef.current);
    await analyzeBlob(blob);
  }

  async function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(file);
    setPreviewUrl(previewUrlRef.current);
    await analyzeBlob(file);
    e.target.value = "";
  }

  async function handleReportHotspot() {
    if (!classification) return;
    try {
      await ecoApi.reportHotspot({
        lat: position.lat,
        lon: position.lon,
        waste_type: classification.waste_type,
        severity: clamp(Math.round(classification.environmental_impact_score / 2), 1, 5),
        image_url: null,
        image_base64: imageBase64
      });
      setHotspotReported(true);
      setStatus("Hotspot reported ✓ — visible on the map.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to report hotspot.");
    }
  }

  function shareResult() {
    if (!classification) return;
    const text = `EcoSentinel detected: ${classification.waste_type.toUpperCase()} — Impact score ${classification.environmental_impact_score.toFixed(1)}/10. ${classification.disposal_recommendation}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setStatus("Result copied to clipboard ✓");
  }

  return (
    <div className="space-y-6">
      {/* Dynamic Tab Switcher */}
      <div className="flex justify-center">
        <div className="flex p-1 rounded-full bg-slate-950/45 border border-border/80 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setActiveTab("scan")}
            className={`px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
              activeTab === "scan"
                ? "bg-secondary text-slate-950 shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            📸 Scan & Report
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("leaderboard")}
            className={`px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
              activeTab === "leaderboard"
                ? "bg-secondary text-slate-950 shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            🏆 Leaderboard
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "scan" ? (
          <motion.div
            key="scan-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="grid gap-6 xl:grid-cols-[1.1fr_minmax(0,0.9fr)]"
          >
            {/* Camera side */}
            <div className="panel subtle-ring overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-amber-200/70">Waste Scanner</p>
                <h2 className="mt-1.5 text-xl font-semibold text-white">Capture waste — connect to local air conditions</h2>
              </div>

              <div className="space-y-4 p-5">
                <div className="relative overflow-hidden rounded-[1.35rem] border border-border bg-slate-950/40">
                  {previewUrl ? (
                    <div className="relative h-[380px] w-full">
                      <Image src={previewUrl} alt="Captured waste" fill unoptimized className="object-cover" />
                    </div>
                  ) : (
                    <video ref={videoRef} muted playsInline className="h-[380px] w-full bg-slate-950 object-cover" />
                  )}

                  {/* High Tech Diagnostics HUD Overlay */}
                  {!error && (
                    <div className="absolute top-4 right-4 z-10 flex flex-col items-end text-[8px] font-mono tracking-widest text-secondary/60 text-right pointer-events-none select-none">
                      <span>SYS_SCANNER: {previewUrl ? "ARCHIVE_CAP" : "LIVE_STREAM"}</span>
                      <span>COORD_LOCK: {position.lat.toFixed(3)}, {position.lon.toFixed(3)}</span>
                      <span>ENGINE: GEMINI_VISION_1.5</span>
                    </div>
                  )}

                  {/* Scan grid overlay (Live Camera Mode) */}
                  {!previewUrl && !error && (
                    <div className="pointer-events-none absolute inset-0">
                      {/* Corner brackets */}
                      {[["top-4 left-4", "border-t-2 border-l-2"], ["top-4 right-4", "border-t-2 border-r-2"], ["bottom-4 left-4", "border-b-2 border-l-2"], ["bottom-4 right-4", "border-b-2 border-r-2"]].map(([pos, border]) => (
                        <div key={pos} className={`absolute ${pos} h-8 w-8 ${border} border-secondary/60 rounded-sm`} />
                      ))}
                      {/* Animated scan line */}
                      <div className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-secondary/80 to-transparent animate-scan-line" />

                      {/* Pulsing center target reticle */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-10 w-10 rounded-full border border-dashed border-secondary/40 animate-ping" />
                        <div className="h-1.5 w-1.5 rounded-full bg-secondary/80" />
                      </div>

                      <div className="absolute bottom-5 left-0 right-0 text-center">
                        <span className="rounded-full bg-slate-950/70 px-4 py-2 text-xs text-slate-200 backdrop-blur border border-border">
                          Point camera at waste or upload an image
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Analyzing Overlay (Sweeping Matrix laser) */}
                  {isAnalyzing && previewUrl && (
                    <div className="absolute inset-0 z-10 pointer-events-none">
                      {/* Glowing sweeping line */}
                      <div className="absolute top-0 bottom-0 left-0 right-0 overflow-hidden">
                        <motion.div
                          className="w-full h-1.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#4cd7f6]"
                          animate={{ y: [0, 380, 0] }}
                          transition={{ repeat: Infinity, duration: 2.0, ease: "easeInOut" }}
                        />
                      </div>
                      {/* High tech analyzing text */}
                      <div className="absolute top-4 left-4 flex flex-col text-[10px] font-mono tracking-widest text-cyan-400 bg-slate-950/80 p-3 rounded-2xl border border-cyan-400/25 backdrop-blur-md">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                          SPECTRAL SCAN ACTIVE
                        </span>
                        <span className="text-[8px] text-slate-400 mt-1">GEMINI PRO CLASSIFICATION LAYER...</span>
                      </div>
                    </div>
                  )}

                  {/* AR Bounding Box Target (Once classified) */}
                  {!isAnalyzing && classification && previewUrl && (
                    <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative h-44 w-44 border border-dashed border-emerald-400/60 rounded-xl"
                      >
                        {/* Corner brackets */}
                        <div className="absolute -top-1.5 -left-1.5 h-4 w-4 border-t-2 border-l-2 border-emerald-400 rounded-sm" />
                        <div className="absolute -top-1.5 -right-1.5 h-4 w-4 border-t-2 border-r-2 border-emerald-400 rounded-sm" />
                        <div className="absolute -bottom-1.5 -left-1.5 h-4 w-4 border-b-2 border-l-2 border-emerald-400 rounded-sm" />
                        <div className="absolute -bottom-1.5 -right-1.5 h-4 w-4 border-b-2 border-r-2 border-emerald-400 rounded-sm" />

                        {/* Floating AR Tag */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-[0.5rem] bg-emerald-400 text-slate-950 text-[10px] font-mono font-bold tracking-widest px-2.5 py-1 shadow-lg shadow-emerald-400/20 whitespace-nowrap">
                          {classification.waste_type.toUpperCase()} LOCKED
                        </div>
                      </motion.div>
                    </div>
                  )}
                </div>

                <canvas ref={canvasRef} className="hidden" />

                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => void handleTakePhoto()}
                    className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-secondary/80 active:scale-95">
                    <CameraIcon className="h-4 w-4" /> Take Photo
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-slate-950/35 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-secondary/35 hover:bg-slate-900 active:scale-95">
                    <UploadIcon className="h-4 w-4" /> Upload Image
                  </button>
                  {classification && (
                    <button type="button" onClick={shareResult}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-slate-950/35 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-emerald-300/35 hover:bg-slate-900 active:scale-95">
                      📋 Share result
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleUploadChange(e)} />
                </div>

                <AnimatePresence>
                  {status && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                      {status}
                    </motion.div>
                  )}
                  {error && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Results side */}
            <TiltCard className="h-full">
              <div className="panel subtle-ring overflow-hidden h-full">
                <div className="border-b border-border px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Classification Result</p>
                  <h2 className="mt-1.5 text-xl font-semibold text-white">Environmental impact & disposal guide</h2>
                </div>

                <div className="space-y-4 p-5">
                  <AnimatePresence mode="wait">
                    {isAnalyzing ? (
                      <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex min-h-[420px] flex-col items-center justify-center gap-6 rounded-[1.2rem] border border-border bg-slate-950/35 text-center px-6">
                        <motion.div className="h-16 w-16 rounded-full border-2 border-secondary/25 border-t-secondary" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }} />
                        <div>
                          <p className="text-lg font-semibold text-white">Analyzing with AI…</p>
                          <p className="mt-2 text-sm text-slate-400 leading-6">Classifying waste, estimating impact, and checking local PM2.5.</p>
                        </div>
                      </motion.div>
                    ) : classification ? (
                      <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                        {/* Type badge */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                          className="rounded-[1.2rem] border border-border bg-slate-950/35 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Waste type</p>
                              <h3 className="mt-2 flex items-center gap-2 text-3xl font-bold uppercase" style={{ color: getImpactTone(classification.environmental_impact_score) }}>
                                {WASTE_EMOJI[classification.waste_type] ?? "♻️"}
                                {classification.waste_type}
                              </h3>
                            </div>
                            <span className="rounded-full border border-border px-3 py-1.5 text-xs text-slate-200">
                              {(classification.confidence * 100).toFixed(0)}% confidence
                            </span>
                          </div>
                          <div className="mt-4 h-2 rounded-full bg-slate-800">
                            <motion.div className="h-2 rounded-full" initial={{ width: 0 }} animate={{ width: `${clamp(classification.confidence * 100, 5, 100)}%` }} transition={{ duration: 0.7 }} style={{ backgroundColor: getImpactTone(classification.environmental_impact_score) }} />
                          </div>
                        </motion.div>

                        {/* Impact + decomposition */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                          className="grid gap-4 md:grid-cols-2">
                          <div className="rounded-[1.2rem] border border-border bg-slate-950/35 p-4">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Impact score</p>
                            <div className="mt-5 flex items-center gap-4">
                              <div className="relative h-24 w-24 shrink-0">
                                <svg viewBox="0 0 120 120" className="h-24 w-24">
                                  <path d="M20 88a40 40 0 0 1 80 0" stroke="rgba(148,163,184,0.12)" strokeWidth="14" fill="none" strokeLinecap="round" />
                                  <motion.path d="M20 88a40 40 0 0 1 80 0" stroke={getImpactTone(classification.environmental_impact_score)} strokeWidth="14" fill="none" strokeLinecap="round"
                                    initial={{ strokeDashoffset: 126, strokeDasharray: "126" }}
                                    animate={{ strokeDashoffset: 126 - classification.environmental_impact_score * 12.6 }}
                                    transition={{ duration: 0.9, ease: "easeOut" }}
                                  />
                                </svg>
                                <div className="absolute inset-x-0 bottom-2 text-center text-2xl font-bold text-white">
                                  {classification.environmental_impact_score.toFixed(1)}
                                </div>
                              </div>
                              <p className="text-xs leading-6 text-slate-400">Higher = more harmful when dumped, burned, or mixed with general waste.</p>
                            </div>
                          </div>

                          <div className="rounded-[1.2rem] border border-border bg-slate-950/35 p-4">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Decomposition</p>
                            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-4 text-3xl font-bold text-white">
                              {decompositionYears || "—"} yrs
                            </motion.p>
                            <div className="mt-4 h-2 rounded-full bg-slate-800">
                              <motion.div className="h-2 rounded-full" initial={{ width: 0 }} animate={{ width: `${decompositionWidth}%` }} transition={{ duration: 0.7, delay: 0.2 }} style={{ backgroundColor: getImpactTone(classification.environmental_impact_score) }} />
                            </div>
                          </div>
                        </motion.div>

                        {/* AQ context */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                          className="rounded-[1.2rem] border border-border bg-slate-950/35 p-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Local air-quality context</p>
                          <p className="mt-3 text-sm leading-7 text-slate-300">{classification.local_air_quality_correlation}</p>
                        </motion.div>

                        {/* Disposal */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                          className="rounded-[1.2rem] border border-border bg-slate-950/35 p-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Disposal guide</p>
                          <p className="mt-3 text-sm leading-7 text-slate-300">{classification.disposal_recommendation}</p>
                        </motion.div>

                        <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                          type="button" onClick={() => void handleReportHotspot()} disabled={hotspotReported}
                          className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${hotspotReported ? "bg-emerald-400/20 text-emerald-300 cursor-default" : "bg-amber-400 text-slate-950 hover:bg-amber-300"}`}>
                          <WasteIcon className="h-4 w-4" />
                          {hotspotReported ? "Hotspot reported ✓" : "Report as hotspot"}
                        </motion.button>
                      </motion.div>
                    ) : (
                      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="flex min-h-[420px] flex-col items-center justify-center gap-5 rounded-[1.2rem] border border-dashed border-border bg-slate-950/20 px-6 text-center">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-900/60 text-secondary">
                          <WasteIcon className="h-9 w-9" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-white">Scanner ready</h3>
                          <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                            Take a photo or upload an image to generate waste class, impact score, decomposition timeline, and disposal recommendation.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </TiltCard>
          </motion.div>
        ) : (
          <motion.div
            key="leaderboard-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="grid gap-6 xl:grid-cols-[1.1fr_minmax(0,0.9fr)]"
          >
            {/* Score standings card */}
            <div className="panel subtle-ring overflow-hidden">
              <div className="border-b border-border px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-secondary/70">Gamified Rankings</p>
                  <h2 className="mt-1.5 text-xl font-semibold text-white">Community Leaderboard</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchLeaderboardData()}
                  className="p-2 rounded-full border border-border bg-slate-950/30 text-slate-300 hover:text-white hover:bg-slate-900 transition flex items-center justify-center"
                >
                  <span className="text-sm">🔄 Refresh</span>
                </button>
              </div>

              <div className="p-5">
                {loadingLeaderboard ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-3">
                    <div className="h-10 w-10 rounded-full border-2 border-secondary/25 border-t-secondary animate-spin" />
                    <p className="text-sm text-slate-400">Loading standings...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {leaderboard.map((user, idx) => {
                      const isUser = user.username.includes("You (Anonymous)");
                      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
                      return (
                        <div
                          key={user.username}
                          className={`flex items-center justify-between rounded-2xl border p-4 transition-all ${
                            isUser
                              ? "bg-secondary/10 border-secondary/30 text-white shadow-lg shadow-secondary/5"
                              : "bg-slate-950/30 border-border text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-xl w-6 text-center font-bold">{medal}</span>
                            <div>
                              <p className={`font-semibold ${isUser ? "text-secondary" : "text-white"}`}>
                                {user.username}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Cleaned: <span className="font-medium text-slate-200">{user.cleaned_count} sites</span>
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-lg font-bold ${isUser ? "text-secondary" : "text-slate-100"}`}>
                              {user.points}
                            </span>
                            <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Eco Points</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Hotspots action card list */}
            <div className="panel subtle-ring overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Neighborhood Cleanup Actions</p>
                <h2 className="mt-1.5 text-xl font-semibold text-white">Active Hotspots</h2>
              </div>

              <div className="p-5 max-h-[550px] overflow-y-auto space-y-4 pr-2 scrollbar-thin">
                {activeHotspots.length === 0 ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-3 text-center border border-dashed border-border rounded-2xl bg-slate-950/10 p-6">
                    <span className="text-4xl">🎉</span>
                    <h3 className="text-sm font-semibold text-white">No active hotspots!</h3>
                    <p className="text-xs text-slate-400">Your community is spotless. Spot some waste and scan it to create a new action site!</p>
                  </div>
                ) : (
                  activeHotspots.map((spot) => (
                    <ActiveHotspotActionCard
                      key={spot.id}
                      spot={spot}
                      onVerified={() => {
                        void fetchLeaderboardData();
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ActiveHotspotActionCardProps {
  spot: WasteHotspotProperties;
  onVerified: () => void;
}

function ActiveHotspotActionCard({ spot, onVerified }: ActiveHotspotActionCardProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    points_awarded?: number;
    feedback?: string;
  } | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await ecoApi.verifyCleanup(spot.id, formData);
      setResult(res);
      if (res.success) {
        onVerified();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification request failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-slate-950/30 p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="text-sm font-bold uppercase tracking-wider text-white">
          {WASTE_EMOJI[spot.waste_type] ?? "♻️"} {spot.waste_type}
        </span>
        <span className="rounded-full bg-amber-400/10 border border-amber-400/20 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400 uppercase">
          Severity {spot.severity}/5
        </span>
      </div>

      <div className="flex gap-4">
        {spot.image_base64 && (
          <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-slate-900">
            <img
              src={spot.image_base64}
              alt="Reported waste"
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="flex flex-col justify-between py-1 text-xs">
          <p className="text-slate-400">
            Reported: <span className="text-slate-200">{new Date(spot.reported_at).toLocaleDateString()}</span>
          </p>
          <p className="text-slate-400 mt-1">
            Potential Reward: <span className="font-semibold text-emerald-400">+{spot.severity * 50} Eco Points</span>
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-2.5 text-xs text-rose-100">
          ❌ {error}
        </div>
      )}

      {result ? (
        <div
          className={`rounded-xl border p-3 text-xs ${
            result.success
              ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
              : "border-amber-400/20 bg-amber-500/10 text-amber-100"
          }`}
        >
          <p className="font-semibold">{result.success ? "🎉 Cleanup Verified!" : "⚠️ Verification Failed"}</p>
          <p className="mt-1 leading-5">{result.message}</p>
          {result.feedback && (
            <p className="mt-1.5 text-2xs italic text-slate-400">AI Feedback: &quot;{result.feedback}&quot;</p>
          )}
        </div>
      ) : (
        <div className="pt-1">
          <div className="relative flex items-center justify-center rounded-xl border border-dashed border-secondary/30 bg-secondary/5 hover:bg-secondary/10 transition cursor-pointer p-3 text-center text-xs">
            {uploading ? (
              <span className="text-secondary flex items-center gap-2">
                <span className="animate-spin text-secondary">&#9696;</span>
                AI Verifying Site Cleanup...
              </span>
            ) : (
              <span className="text-secondary font-semibold flex items-center gap-1.5">
                🧹 Clean this site & upload photo
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={uploading}
              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>
        </div>
      )}
    </div>
  );
}
