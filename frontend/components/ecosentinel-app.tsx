"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

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
import type {
  AirQualityReading,
  IndiaHotspot,
  RealtimeAlert,
} from "@/lib/api";
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
      <div className="panel subtle-ring flex min-h-[540px] items-center justify-center text-sm text-slate-300">
        Loading map...
      </div>
    ),
  },
);

type ViewKey =
  | "dashboard"
  | "air"
  | "fires"
  | "waste"
  | "voice"
  | "predictions";

interface NavItem {
  id: ViewKey;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Live overview",
    icon: <DashboardIcon className="h-5 w-5" />,
  },
  {
    id: "air",
    label: "Air Quality",
    description: "PM2.5 trends",
    icon: <AirIcon className="h-5 w-5" />,
  },
  {
    id: "fires",
    label: "Fire Map",
    description: "Active hotspots",
    icon: <FireIcon className="h-5 w-5" />,
  },
  {
    id: "waste",
    label: "Waste Scanner",
    description: "Vision analysis",
    icon: <WasteIcon className="h-5 w-5" />,
  },
  {
    id: "voice",
    label: "Voice Assistant",
    description: "Ask your data",
    icon: <MicIcon className="h-5 w-5" />,
  },
  {
    id: "predictions",
    label: "Predictions",
    description: "Next 24 hours",
    icon: <ForecastIcon className="h-5 w-5" />,
  },
];

function StatCard({
  label,
  value,
  tone,
  helper,
}: {
  label: string;
  value: string;
  tone: string;
  helper: string;
}) {
  return (
    <div className="panel subtle-ring border-l-4 p-4" style={{ borderLeftColor: tone }}>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{helper}</p>
    </div>
  );
}

export function EcoSentinelApp() {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [location, setLocation] = useState<{
    lat: number;
    lon: number;
    city: string;
  }>({ ...BENGALURU_LOCATION });
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

  const {
    airReadings: liveAirReadings,
    alerts: realtimeAlerts,
    isConnected,
    lastUpdate,
  } = useRealtimeFeed();
  const deferredAlerts = useDeferredValue(realtimeAlerts);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation((current) => ({
          ...current,
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        }));
      },
      () => {
        // Fall back to Bengaluru silently.
      },
      { enableHighAccuracy: true, timeout: 8_000 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setOverviewLoading(true);
      try {
        const [nearest, summary, wasteHotspots, indiaHotspots] = await Promise.all([
          ecoApi.getNearestStations(location.lat, location.lon),
          ecoApi.getFireSummary(),
          ecoApi.getWasteHotspots(),
          ecoApi.getIndiaHotspots(),
        ]);

        if (cancelled) {
          return;
        }

        setOverviewAir(nearest);
        setFireSummary(summary);
        setWasteCount(wasteHotspots.features.length);
        setHotspots(indiaHotspots);
        if (nearest[0]?.location.city) {
          setLocation((current) => ({
            ...current,
            city: nearest[0].location.city,
          }));
        }
        setOverviewError(null);
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the dashboard overview.";
        setOverviewError(message);
      } finally {
        if (!cancelled) {
          setOverviewLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lon]);

  const airSource = liveAirReadings.length ? liveAirReadings : overviewAir;
  const primaryReading = airSource[0];
  const currentPm25 = primaryReading?.value ?? 0;
  const aqiCategory = getPm25Category(currentPm25);
  const displayedAlerts = deferredAlerts.length
    ? deferredAlerts
    : buildFallbackAlerts({
        air: primaryReading,
        fireCount: fireSummary.high_confidence_count,
        wasteCount,
      });

  const viewTitle = useMemo(() => {
    return NAV_ITEMS.find((item) => item.id === activeView)?.label ?? "Dashboard";
  }, [activeView]);

  return (
    <div className="min-h-screen px-4 py-4 lg:px-6">
      <div className="mx-auto grid max-w-[1600px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="panel subtle-ring sticky top-4 hidden h-[calc(100vh-2rem)] overflow-hidden lg:flex lg:flex-col">
          <div className="border-b border-border px-5 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-300">
                <LeafIcon className="h-7 w-7" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">EcoSentinel</p>
                <p className="text-sm text-slate-400">
                  Environmental intelligence
                </p>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-2 px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const isActive = item.id === activeView;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition ${
                    isActive
                      ? "bg-sky-400/10 text-sky-200"
                      : "text-slate-300 hover:bg-slate-900/70"
                  }`}
                >
                  <span className="mt-0.5">{item.icon}</span>
                  <span>
                    <span className="block font-medium">{item.label}</span>
                    <span className="block text-sm text-slate-400">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-border px-4 py-4">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-3 w-3 rounded-full ${
                    isConnected ? "bg-emerald-400" : "bg-slate-500"
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-white">Live Data</p>
                  <p className="text-xs text-slate-400">
                    {isConnected
                      ? `Connected${lastUpdate ? ` · ${formatRelativeTime(lastUpdate)}` : ""}`
                      : "Waiting for websocket"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="space-y-5">
          <header className="panel subtle-ring overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-sky-200/70">
                    {viewTitle}
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold text-white">
                    Real-time environmental monitoring for {location.city}
                  </h1>
                </div>
                <div className="rounded-full border border-border bg-slate-950/35 px-4 py-2 text-sm text-slate-200">
                  {location.lat.toFixed(3)}, {location.lon.toFixed(3)}
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="PM2.5"
                value={overviewLoading ? "--" : `${currentPm25.toFixed(1)} ug/m3`}
                tone={getPm25Color(currentPm25)}
                helper={primaryReading ? `${aqiCategory} conditions nearby` : "Waiting for a nearby station"}
              />
              <StatCard
                label="Active Fires"
                value={overviewLoading ? "--" : String(fireSummary.high_confidence_count)}
                tone="#fb7185"
                helper="High-confidence FIRMS detections"
              />
              <StatCard
                label="Waste Reports"
                value={overviewLoading ? "--" : String(wasteCount)}
                tone="#4ade80"
                helper="Community hotspot reports"
              />
              <StatCard
                label="AQI Category"
                value={overviewLoading ? "--" : aqiCategory}
                tone="#38bdf8"
                helper={isConnected ? "Live websocket feed active" : "Polling API data"}
              />
            </div>
          </header>

          {overviewError ? (
            <div className="rounded-[1.2rem] border border-rose-400/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
              {overviewError}
            </div>
          ) : null}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ duration: 0.26, ease: "easeOut" }}
              className="space-y-5"
            >
              {activeView === "dashboard" ? (
                <>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.85fr)]">
                    <EcoMap lat={location.lat} lon={location.lon} />
                    <AlertsPanel alerts={displayedAlerts} />
                  </div>
                  <AQIChart lat={location.lat} lon={location.lon} />
                </>
              ) : null}

              {activeView === "air" ? (
                <>
                  <AQIChart lat={location.lat} lon={location.lon} showWeekly />
                  <HotspotsPanel hotspots={hotspots} />
                </>
              ) : null}

              {activeView === "fires" ? (
                <>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
                    <EcoMap lat={location.lat} lon={location.lon} />
                    <FireSummaryPanel
                      highConfidenceCount={fireSummary.high_confidence_count}
                      states={fireSummary.states_affected}
                    />
                  </div>
                </>
              ) : null}

              {activeView === "waste" ? (
                <WasteScanner initialLat={location.lat} initialLon={location.lon} />
              ) : null}

              {activeView === "voice" ? (
                <VoiceAssistant
                  initialLat={location.lat}
                  initialLon={location.lon}
                  city={location.city}
                />
              ) : null}

              {activeView === "predictions" ? (
                <AQIChart
                  lat={location.lat}
                  lon={location.lon}
                  title="Prediction engine and safer outdoor windows"
                  showWeekly
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function AlertsPanel({ alerts }: { alerts: RealtimeAlert[] }) {
  return (
    <section className="panel subtle-ring overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 text-sm uppercase tracking-[0.22em] text-amber-200/70">
          <AlertIcon className="h-4 w-4" />
          Recent Alerts
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white">
          High-risk events and air-quality changes
        </h2>
      </div>
      <div className="max-h-[540px] space-y-3 overflow-y-auto p-5">
        {alerts.map((alert, index) => (
          <div
            key={`${alert.timestamp}-${index}`}
            className="rounded-[1.15rem] border border-border bg-slate-950/30 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-white">{alert.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {alert.message}
                </p>
              </div>
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold uppercase"
                style={{
                  background:
                    alert.severity === "critical"
                      ? "rgba(251, 113, 133, 0.14)"
                      : alert.severity === "warning"
                        ? "rgba(252, 211, 77, 0.16)"
                        : "rgba(56, 189, 248, 0.14)",
                  color:
                    alert.severity === "critical"
                      ? "#fecdd3"
                      : alert.severity === "warning"
                        ? "#fde68a"
                        : "#bae6fd",
                }}
              >
                {alert.severity}
              </span>
            </div>
            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">
              {formatRelativeTime(alert.timestamp)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HotspotsPanel({ hotspots }: { hotspots: IndiaHotspot[] }) {
  return (
    <section className="panel subtle-ring overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 text-sm uppercase tracking-[0.22em] text-sky-200/70">
          <AirIcon className="h-4 w-4" />
          India Hotspots
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white">
          Highest PM2.5 locations from the current OpenAQ feed
        </h2>
      </div>
      <div className="space-y-3 p-5">
        {hotspots.length ? (
          hotspots.slice(0, 8).map((spot) => (
            <div
              key={`${spot.location_id}-${spot.timestamp}`}
              className="grid gap-3 rounded-[1.15rem] border border-border bg-slate-950/30 p-4 md:grid-cols-[minmax(0,1fr)_110px]"
            >
              <div>
                <p className="font-medium text-white">{spot.location_name}</p>
                <p className="mt-1 text-sm text-slate-400">{spot.city}</p>
              </div>
              <div className="text-right">
                <p
                  className="text-2xl font-semibold"
                  style={{ color: getPm25Color(spot.pm25) }}
                >
                  {spot.pm25.toFixed(1)}
                </p>
                <p className="text-sm text-slate-400">{spot.unit}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[1.15rem] border border-dashed border-border bg-slate-950/25 p-6 text-center text-sm leading-6 text-slate-400">
            Hotspot data will appear here once the backend can reach OpenAQ.
          </div>
        )}
      </div>
    </section>
  );
}

function FireSummaryPanel({
  highConfidenceCount,
  states,
}: {
  highConfidenceCount: number;
  states: string[];
}) {
  return (
    <section className="panel subtle-ring overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 text-sm uppercase tracking-[0.22em] text-rose-200/70">
          <FireIcon className="h-4 w-4" />
          Fire Intelligence
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white">
          India-wide satellite fire summary
        </h2>
      </div>
      <div className="space-y-4 p-5">
        <div className="rounded-[1.2rem] border border-border bg-slate-950/30 p-4">
          <p className="text-sm text-slate-400">High-confidence detections</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {highConfidenceCount}
          </p>
        </div>
        <div className="rounded-[1.2rem] border border-border bg-slate-950/30 p-4">
          <p className="text-sm text-slate-400">States affected</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {states.length ? (
              states.map((state) => (
                <span
                  key={state}
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-slate-200"
                >
                  {state}
                </span>
              ))
            ) : (
              <p className="text-sm text-slate-400">
                Waiting for active-fire data from NASA FIRMS.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function buildFallbackAlerts({
  air,
  fireCount,
  wasteCount,
}: {
  air?: AirQualityReading;
  fireCount: number;
  wasteCount: number;
}): RealtimeAlert[] {
  const alerts: RealtimeAlert[] = [];

  if (air) {
    alerts.push({
      type: "alert",
      severity: air.value > 200 ? "critical" : air.value > 100 ? "warning" : "info",
      title: `PM2.5 near ${air.location.city}`,
      message: `${air.value.toFixed(1)} ug/m3 · ${getPm25Category(air.value)} category from the nearest station.`,
      source: "air_quality",
      timestamp: air.timestamp,
    });
  }

  alerts.push({
    type: "alert",
    severity: fireCount > 10 ? "critical" : fireCount > 0 ? "warning" : "info",
    title: "Fire activity summary",
    message: `${fireCount} high-confidence fire detections are currently active in the latest summary.`,
    source: "fire",
    timestamp: new Date().toISOString(),
  });

  alerts.push({
    type: "alert",
    severity: wasteCount > 8 ? "warning" : "info",
    title: "Waste hotspot reports",
    message: `${wasteCount} community waste hotspots are available for map review.`,
    source: "air_quality",
    timestamp: new Date().toISOString(),
  });

  return alerts;
}
