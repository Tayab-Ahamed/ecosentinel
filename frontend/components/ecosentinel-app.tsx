"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";

import { AQIChart } from "@/components/aqi-chart";
import {
  AirIcon,
  AlertIcon,
  DashboardIcon,
  FireIcon,
  ForecastIcon,
  LeafIcon,
  MicIcon,
  WasteIcon,
} from "@/components/icons";
import { VoiceAssistant } from "@/components/voice-assistant";
import { WasteScanner } from "@/components/waste-scanner";
import { CarbonCalculator } from "@/components/carbon-calculator";
import type { AirQualityReading, IndiaHotspot, RealtimeAlert } from "@/lib/api";
import { BENGALURU_LOCATION, ecoApi } from "@/lib/api";
import {
  formatRelativeTime,
  getPm25Category,
  getPm25Color,
} from "@/lib/environment";
import { useRealtimeFeed } from "@/lib/websocket";

const EcoMap = dynamic(
  () => import("@/components/eco-map").then((mod) => mod.EcoMap),
  {
    ssr: false,
    loading: () => (
      <div className="panel subtle-ring flex min-h-[540px] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-secondary/20 border-t-secondary" />
          <p className="text-sm text-slate-400">Loading map…</p>
        </div>
      </div>
    ),
  },
);

type ViewKey = "dashboard" | "air" | "fires" | "waste" | "voice" | "predictions" | "carbon";

interface NavItem {
  id: ViewKey;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard",   label: "Dashboard",    description: "Live overview",    icon: <DashboardIcon className="h-5 w-5" /> },
  { id: "air",         label: "Air Quality",  description: "PM2.5 trends",     icon: <AirIcon className="h-5 w-5" /> },
  { id: "fires",       label: "Fire Map",     description: "Active hotspots",  icon: <FireIcon className="h-5 w-5" /> },
  { id: "waste",       label: "Waste Scanner",description: "Vision analysis",  icon: <WasteIcon className="h-5 w-5" /> },
  { id: "voice",       label: "Voice AI",     description: "Ask your data",    icon: <MicIcon className="h-5 w-5" /> },
  { id: "predictions", label: "Predictions",  description: "Next 24 hours",    icon: <ForecastIcon className="h-5 w-5" /> },
  { id: "carbon",      label: "Carbon Calc",  description: "Your footprint",   icon: <LeafIcon className="h-5 w-5" /> },
];

/* ── Toast system ──────────────────────────────────────────────── */
interface Toast {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className={`toast toast-${t.severity}`}
            onClick={() => onDismiss(t.id)}
          >
            <p className="font-semibold">{t.title}</p>
            <p className="mt-1 text-sm opacity-80">{t.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ── Animated stat card ────────────────────────────────────────── */
function StatCard({
  label,
  value,
  tone,
  helper,
  loading,
}: {
  label: string;
  value: string;
  tone: string;
  helper: string;
  loading?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="panel subtle-ring relative overflow-hidden border-l-4 p-4"
      style={{ borderLeftColor: tone }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-10 blur-2xl"
        style={{ background: tone }}
      />
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-24 animate-shimmer rounded-lg" />
      ) : (
        <motion.p
          key={value}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 text-2xl font-bold text-white"
        >
          {value}
        </motion.p>
      )}
      <p className="mt-2 text-xs text-slate-400">{helper}</p>
    </motion.div>
  );
}

/* ── AQI Ticker ────────────────────────────────────────────────── */
function AQITicker({ hotspots }: { hotspots: IndiaHotspot[] }) {
  if (!hotspots.length) return null;
  // Duplicate for seamless loop
  const items = [...hotspots, ...hotspots];
  return (
    <div className="relative overflow-hidden border-b border-border bg-slate-950/60 px-4 py-2 text-xs">
      <div className="flex items-center gap-3">
        <span className="shrink-0 rounded-sm bg-secondary/15 px-2 py-0.5 font-semibold uppercase tracking-wider text-secondary">
          Live AQI
        </span>
        <div className="overflow-hidden">
          <div className="animate-ticker flex gap-8">
            {items.map((s, i) => (
              <span
                key={`ticker-${s.location_id || "loc"}-${i}`}
                className="shrink-0 whitespace-nowrap"
                style={{ color: getPm25Color(s.pm25) }}
              >
                {s.city || s.location_name}: {s.pm25.toFixed(0)} µg/m³
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Environmental Score Card ─────────────────────────────────── */
function EcoScoreGauge({
  pm25,
  fireCount,
  wasteCount,
}: {
  pm25: number;
  fireCount: number;
  wasteCount: number;
}) {
  // Composite 0-100 score (lower PM25 / fires / waste = higher score)
  const airScore = Math.max(0, 100 - pm25 * 0.5);
  const fireScore = Math.max(0, 100 - fireCount * 3);
  const wasteScore = Math.max(0, 100 - wasteCount * 5);
  const total = Math.round((airScore + fireScore + wasteScore) / 3);
  const color = total >= 70 ? "#4ade80" : total >= 40 ? "#fcd34d" : "#fb7185";
  const label = total >= 70 ? "Good" : total >= 40 ? "Moderate" : "Needs attention";
  const circumference = 2 * Math.PI * 36;
  const dash = (total / 100) * circumference;

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 shrink-0">
        <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
          <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="7" />
          <motion.circle
            cx="40" cy="40" r="36"
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - dash }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white">{total}</span>
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Eco Score</p>
        <p className="mt-1 font-semibold" style={{ color }}>{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">Air · Fire · Waste composite</p>
      </div>
    </div>
  );
}

/* ── Main App ─────────────────────────────────────────────────── */
export function EcoSentinelApp() {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [location, setLocation] = useState<{ lat: number; lon: number; city: string }>({ ...BENGALURU_LOCATION });
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewAir, setOverviewAir] = useState<AirQualityReading[]>([]);
  const [hotspots, setHotspots] = useState<IndiaHotspot[]>([]);
  const [fireSummary, setFireSummary] = useState({
    total_count: 0,
    high_confidence_count: 0,
    states_affected: [] as string[],
    nearest_fire_to_bengaluru: {},
  });
  const [wasteCount, setWasteCount] = useState(0);
  const [demoMode, setDemoMode] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const shownAlertsRef = useRef(new Set<string>());

  const { airReadings: liveAirReadings, alerts: realtimeAlerts, isConnected, lastUpdate } =
    useRealtimeFeed();
  const deferredAlerts = useDeferredValue(realtimeAlerts);

  // Geolocation
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setLocation((c) => ({ ...c, lat: pos.coords.latitude, lon: pos.coords.longitude })),
      () => {},
      { enableHighAccuracy: true, timeout: 8_000 },
    );
  }, []);

  // Load overview data using the bundled /stats/dashboard endpoint
  useEffect(() => {
    let cancelled = false;
    async function loadOverview() {
      setOverviewLoading(true);
      try {
        // Try bundled endpoint first (faster), fall back to individual calls
        let data: {
          pm25?: number; city?: string; fire_summary?: typeof fireSummary;
          india_hotspots?: IndiaHotspot[]; waste_count?: number; air_readings?: AirQualityReading[];
        } | null = null;
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8005"}/api/stats/dashboard?lat=${location.lat}&lon=${location.lon}`
          );
          if (res.ok) data = await res.json();
        } catch { /* fall back */ }

        if (data && !cancelled) {
          if (data.air_readings?.length) setOverviewAir(data.air_readings as AirQualityReading[]);
          if (data.fire_summary) setFireSummary(data.fire_summary as typeof fireSummary);
          if (data.india_hotspots) setHotspots(data.india_hotspots);
          if (typeof data.waste_count === "number") setWasteCount(data.waste_count);
          if (data.city) setLocation((c) => ({ ...c, city: data!.city! }));
        } else {
          // Fallback: parallel individual calls
          const [nearest, summary, wasteHotspots, indiaHotspots] = await Promise.all([
            ecoApi.getNearestStations(location.lat, location.lon),
            ecoApi.getFireSummary(),
            ecoApi.getWasteHotspots(),
            ecoApi.getIndiaHotspots(),
          ]);
          if (cancelled) return;
          setOverviewAir(nearest);
          setFireSummary(summary);
          setWasteCount(wasteHotspots.features.length);
          setHotspots(indiaHotspots);
          if (nearest[0]?.location.city) setLocation((c) => ({ ...c, city: nearest[0].location.city }));
        }
        setOverviewError(null);
      } catch (err) {
        if (!cancelled) setOverviewError(err instanceof Error ? err.message : "Unable to load overview.");
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    }
    void loadOverview();
    return () => { cancelled = true; };
  }, [location.lat, location.lon]);

  // Show toast for new high-severity WebSocket alerts
  useEffect(() => {
    for (const alert of deferredAlerts) {
      const key = `${alert.timestamp}-${alert.title}`;
      if (!shownAlertsRef.current.has(key) && ["critical", "warning"].includes(alert.severity)) {
        shownAlertsRef.current.add(key);
        const id = crypto.randomUUID();
        setToasts((prev) => [...prev, { id, severity: alert.severity, title: alert.title, message: alert.message }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
      }
    }
  }, [deferredAlerts]);

  const airSource = liveAirReadings.length ? liveAirReadings : overviewAir;
  const primaryReading = airSource[0];
  const currentPm25 = primaryReading?.value ?? 0;
  const aqiCategory = getPm25Category(currentPm25);
  const displayedAlerts = deferredAlerts.length ? deferredAlerts : buildFallbackAlerts({ air: primaryReading, fireCount: fireSummary.high_confidence_count, wasteCount });
  const viewTitle = useMemo(() => NAV_ITEMS.find((n) => n.id === activeView)?.label ?? "Dashboard", [activeView]);

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      {/* AQI Ticker */}
      <AQITicker hotspots={hotspots} />

      <div className="px-3 py-4 lg:px-6">
        <div className="mx-auto grid max-w-[1600px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">

          {/* Sidebar */}
          <aside className="panel subtle-ring sticky top-4 hidden h-[calc(100vh-5rem)] overflow-hidden lg:flex lg:flex-col">
            <div className="border-b border-border px-5 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
                  <LeafIcon className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-white tracking-tight">EcoSentinel</p>
                  <p className="text-xs text-slate-400">Environmental Intelligence</p>
                </div>
              </div>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {NAV_ITEMS.map((item, i) => {
                const isActive = item.id === activeView;
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-200 btn-premium ${
                      isActive
                        ? "sidebar-active"
                        : "text-slate-300 hover:bg-slate-900/60 hover:text-white"
                    }`}
                  >
                    <span className="mt-0.5 shrink-0">{item.icon}</span>
                    <span>
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-xs text-slate-500">{item.description}</span>
                    </span>
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute right-4 h-1.5 w-1.5 rounded-full bg-primary"
                      />
                    )}
                  </motion.button>
                );
              })}
            </nav>

            {/* Live / Eco Score footer */}
            <div className="space-y-3 border-t border-border px-4 py-4">
              <button
                type="button"
                onClick={() => setDemoMode((v) => !v)}
                className={`w-full rounded-2xl border px-4 py-3 text-left text-xs transition-all duration-300 btn-premium ${
                  demoMode
                    ? "border-amber-400/40 bg-amber-500/10 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.06)]"
                    : "border-border bg-slate-950/35 text-slate-400 hover:text-white"
                }`}
              >
                <span className="font-semibold">{demoMode ? "Demo mode on" : "Demo mode off"}</span>
                <span className="mt-1 block text-[10px] opacity-80">
                  {demoMode ? "Showing sample environmental data" : "Use live APIs when keys are configured"}
                </span>
              </button>
              <EcoScoreGauge pm25={currentPm25} fireCount={fireSummary.high_confidence_count} wasteCount={wasteCount} />
              <div className="rounded-2xl border border-border bg-slate-950/35 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.7)]" : "bg-slate-500"}`} />
                  <div>
                    <p className="text-xs font-medium text-white">Live Data</p>
                    <p className="text-[10px] text-slate-500">
                      {isConnected ? `Connected${lastUpdate ? ` · ${formatRelativeTime(lastUpdate)}` : ""}` : "Waiting for WebSocket"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="space-y-5">
            {/* Header */}
            <header className="panel subtle-ring overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-secondary/60">{viewTitle}</p>
                    <h1 className="mt-1.5 text-2xl font-bold text-white leading-tight">
                      Real-time environmental monitoring
                      {" "}<span className="text-secondary">{location.city}</span>
                    </h1>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-border bg-slate-950/35 px-4 py-2 text-xs text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-secondary/70" />
                    {location.lat.toFixed(3)}, {location.lon.toFixed(3)}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="PM2.5" value={overviewLoading ? "—" : `${currentPm25.toFixed(1)} µg/m³`} tone={getPm25Color(currentPm25)} helper={primaryReading ? `${aqiCategory} · nearby station` : "Searching stations…"} loading={overviewLoading} />
                <StatCard label="Active Fires" value={overviewLoading ? "—" : String(fireSummary.high_confidence_count)} tone="#fb7185" helper="High-confidence NASA detections" loading={overviewLoading} />
                <StatCard label="Waste Reports" value={overviewLoading ? "—" : String(wasteCount)} tone="#4ade80" helper="Community hotspot reports" loading={overviewLoading} />
                <StatCard label="AQI Category" value={overviewLoading ? "—" : aqiCategory} tone="#4cd7f6" helper={isConnected ? "WebSocket live feed active" : "Polling API"} loading={overviewLoading} />
              </div>
            </header>

            {overviewError && (
              <div className="rounded-[1.2rem] border border-rose-400/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
                ⚠ {overviewError}
              </div>
            )}

            {/* View routing */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="space-y-5"
              >
                {activeView === "dashboard" && (
                  <>
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.85fr)]">
                      <EcoMap lat={location.lat} lon={location.lon} demoMode={demoMode} />
                      <AlertsPanel alerts={displayedAlerts} />
                    </div>
                    <AQIChart lat={location.lat} lon={location.lon} demoMode={demoMode} />
                  </>
                )}
                {activeView === "air" && (
                  <>
                    <AQIChart lat={location.lat} lon={location.lon} showWeekly demoMode={demoMode} />
                    <HotspotsPanel hotspots={hotspots} />
                  </>
                )}
                {activeView === "fires" && (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
                    <EcoMap lat={location.lat} lon={location.lon} demoMode={demoMode} />
                    <FireSummaryPanel highConfidenceCount={fireSummary.high_confidence_count} states={fireSummary.states_affected} />
                  </div>
                )}
                {activeView === "waste" && <WasteScanner initialLat={location.lat} initialLon={location.lon} />}
                {activeView === "voice" && <VoiceAssistant initialLat={location.lat} initialLon={location.lon} city={location.city} />}
                {activeView === "predictions" && (
                  <AQIChart
                    lat={location.lat}
                    lon={location.lon}
                    title="Prediction engine & safer outdoor windows"
                    showWeekly
                    demoMode={demoMode}
                  />
                )}
                {activeView === "carbon" && <CarbonCalculator />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav lg:hidden">
        {NAV_ITEMS.slice(0, 6).map((item) => {
          const isActive = item.id === activeView;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 transition-colors ${isActive ? "text-secondary" : "text-slate-500"}`}
            >
              <span className={`transition-transform ${isActive ? "scale-110" : ""}`}>{item.icon}</span>
              <span className="text-[9px] font-medium">{item.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </nav>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}

/* ── Sub-panels ─────────────────────────────────────────────────── */
function AlertsPanel({ alerts }: { alerts: RealtimeAlert[] }) {
  return (
    <section className="panel subtle-ring overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-amber-200/70"><AlertIcon className="h-4 w-4" /> Recent Alerts</div>
        <h2 className="mt-1.5 text-lg font-semibold text-white">High-risk events & air changes</h2>
      </div>
      <div className="max-h-[540px] space-y-3 overflow-y-auto p-5">
        {alerts.map((alert, i) => (
          <motion.div
            key={`${alert.timestamp}-${i}`}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-[1.1rem] border border-border bg-slate-950/30 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">{alert.title}</p>
                <p className="mt-1.5 text-xs leading-5 text-slate-400">{alert.message}</p>
              </div>
              <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: alert.severity === "critical" ? "rgba(251,113,133,0.14)" : alert.severity === "warning" ? "rgba(252,211,77,0.16)" : "rgba(76,215,246,0.14)",
                  color: alert.severity === "critical" ? "#fecdd3" : alert.severity === "warning" ? "#fde68a" : "#4cd7f6",
                }}
              >{alert.severity}</span>
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-slate-600">{formatRelativeTime(alert.timestamp)}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function HotspotsPanel({ hotspots }: { hotspots: IndiaHotspot[] }) {
  return (
    <section className="panel subtle-ring overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-secondary/70"><AirIcon className="h-4 w-4" /> India Hotspots</div>
        <h2 className="mt-1.5 text-lg font-semibold text-white">Highest PM2.5 from current OpenAQ feed</h2>
      </div>
      <div className="space-y-3 p-5">
        {hotspots.length ? hotspots.slice(0, 8).map((spot, i) => (
          <motion.div key={`hotspot-${spot.location_id || "loc"}-${spot.timestamp || "ts"}-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
            className="grid gap-3 rounded-[1.1rem] border border-border bg-slate-950/30 p-4 md:grid-cols-[1fr_100px]"
          >
            <div>
              <p className="text-sm font-medium text-white">{spot.location_name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{spot.city}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold" style={{ color: getPm25Color(spot.pm25) }}>{spot.pm25.toFixed(1)}</p>
              <p className="text-[10px] text-slate-500">{spot.unit}</p>
            </div>
          </motion.div>
        )) : (
          <div className="rounded-[1.1rem] border border-dashed border-border bg-slate-950/20 p-6 text-center text-sm text-slate-500">
            Hotspot data will appear once OpenAQ responds.
          </div>
        )}
      </div>
    </section>
  );
}

function FireSummaryPanel({ highConfidenceCount, states }: { highConfidenceCount: number; states: string[] }) {
  return (
    <section className="panel subtle-ring overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-rose-200/70"><FireIcon className="h-4 w-4" /> Fire Intelligence</div>
        <h2 className="mt-1.5 text-lg font-semibold text-white">India-wide satellite fire summary</h2>
      </div>
      <div className="space-y-4 p-5">
        <div className="rounded-[1.2rem] border border-border bg-slate-950/30 p-4">
          <p className="text-xs text-slate-400">High-confidence detections</p>
          <motion.p key={highConfidenceCount} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-3xl font-bold text-white">{highConfidenceCount}</motion.p>
        </div>
        <div className="rounded-[1.2rem] border border-border bg-slate-950/30 p-4">
          <p className="text-xs text-slate-400">States affected</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {states.length ? states.map((s) => (
              <span key={s} className="rounded-full border border-border bg-rose-500/10 px-3 py-1 text-xs text-rose-200">{s}</span>
            )) : <p className="text-xs text-slate-500">Waiting for NASA FIRMS data.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function buildFallbackAlerts({ air, fireCount, wasteCount }: { air?: AirQualityReading; fireCount: number; wasteCount: number }): RealtimeAlert[] {
  const alerts: RealtimeAlert[] = [];
  if (air) alerts.push({ type: "alert", severity: air.value > 200 ? "critical" : air.value > 100 ? "warning" : "info", title: `PM2.5 near ${air.location.city}`, message: `${air.value.toFixed(1)} µg/m³ · ${getPm25Category(air.value)} from nearest station.`, source: "air_quality", timestamp: air.timestamp });
  alerts.push({ type: "alert", severity: fireCount > 10 ? "critical" : fireCount > 0 ? "warning" : "info", title: "Fire activity summary", message: `${fireCount} high-confidence fire detections active in latest summary.`, source: "fire", timestamp: new Date().toISOString() });
  alerts.push({ type: "alert", severity: wasteCount > 8 ? "warning" : "info", title: "Waste hotspot reports", message: `${wasteCount} community waste hotspots available for map review.`, source: "air_quality", timestamp: new Date().toISOString() });
  return alerts;
}
