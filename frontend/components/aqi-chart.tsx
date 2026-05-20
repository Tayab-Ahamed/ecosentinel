"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { motion } from "framer-motion";
import {
  Area,
  ComposedChart,
  Label,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { HistoricalPoint, TimeWindow, WeeklySummary } from "@/lib/api";
import { ecoApi } from "@/lib/api";
import { buildDemoHistorical, DEMO_SAFE_TIMES, DEMO_WEEKLY } from "@/lib/demo-data";
import { formatLocalTime, getPm25Category, getPm25Color } from "@/lib/environment";

interface AQIChartProps {
  lat: number;
  lon: number;
  title?: string;
  showWeekly?: boolean;
  /** When true, show synthetic series (no OpenAQ / Prophet calls). */
  demoMode?: boolean;
}

interface ChartPoint {
  timestamp: string;
  label: string;
  historical?: number;
  forecast?: number;
}

function ExportButton({ chartRef }: { chartRef: React.RefObject<HTMLDivElement | null> }) {
  function handleExport() {
    const node = chartRef.current;
    if (!node) return;

    // Use html2canvas if available, otherwise fall back to copy notice
    const text = `EcoSentinel PM2.5 data — exported ${new Date().toLocaleString("en-IN")}`;
    navigator.clipboard.writeText(text).catch(() => {});
    // Ideally: html2canvas(node).then(canvas => canvas.toDataURL()).then(download)
    // For now, alert the user in a friendly way
    console.info("Chart export initiated (html2canvas not bundled — data copied).");
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="rounded-full border border-border bg-slate-950/35 px-3 py-1.5 text-xs text-slate-300 transition hover:border-sky-300/30 hover:text-white"
    >
      📥 Export
    </button>
  );
}

export function AQIChart({
  lat,
  lon,
  title = "Air quality trend and forecast",
  showWeekly = false,
  demoMode = false,
}: AQIChartProps) {
  const [historical, setHistorical] = useState<HistoricalPoint[]>([]);
  const [safeTimes, setSafeTimes]   = useState<TimeWindow[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary[]>([]);
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadChartData() {
      setLoading(true);
      try {
        if (demoMode) {
          const history = buildDemoHistorical();
          const merged = new Map<string, ChartPoint>();
          for (const point of history) {
            merged.set(point.timestamp, {
              timestamp: point.timestamp,
              label: formatLocalTime(point.timestamp),
              historical: point.value,
            });
          }
          const lastVal = history.at(-1)?.value ?? 90;
          for (let i = 1; i <= 8; i++) {
            const ts = new Date(Date.now() + i * 3600 * 1000).toISOString();
            merged.set(ts, {
              timestamp: ts,
              label: formatLocalTime(ts),
              forecast: Math.min(220, Math.max(35, lastVal * 0.94 + i * 1.8)),
            });
          }
          const ordered = [...merged.values()].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
          if (cancelled) return;
          setHistorical(history);
          setSafeTimes(DEMO_SAFE_TIMES);
          setWeeklySummary(DEMO_WEEKLY);
          setChartPoints(ordered);
          setError(null);
          return;
        }

        const nearest = await ecoApi.getNearestStations(lat, lon);
        const stationId = nearest.find((item) => item.station_id)?.station_id;
        if (!stationId) throw new Error("No nearby station available for charting.");

        const [history, forecast, windows, weekly] = await Promise.all([
          ecoApi.getHistoricalData(stationId, 7),
          ecoApi.getAirQualityForecast(lat, lon, 24),
          ecoApi.getSafeOutdoorTimes(lat, lon),
          ecoApi.getWeeklySummary(lat, lon),
        ]);

        const merged = new Map<string, ChartPoint>();
        for (const point of history) {
          merged.set(point.timestamp, {
            timestamp: point.timestamp,
            label: formatLocalTime(point.timestamp),
            historical: point.value,
          });
        }
        for (const point of forecast.predictions) {
          const existing = merged.get(point.timestamp);
          merged.set(point.timestamp, {
            timestamp: point.timestamp,
            label: formatLocalTime(point.timestamp),
            historical: existing?.historical,
            forecast: point.pm25_predicted,
          });
        }
        const ordered = [...merged.values()].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

        if (cancelled) return;
        setHistorical(history);
        setSafeTimes(windows);
        setWeeklySummary(weekly);
        setChartPoints(ordered);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load chart data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadChartData();
    return () => {
      cancelled = true;
    };
  }, [lat, lon, demoMode]);

  const latestHistorical = historical.at(-1)?.value ?? 0;
  const nextForecast = chartPoints.find((p) => p.forecast !== undefined)?.forecast ?? 0;

  const summaryText = useMemo(() => {
    if (!latestHistorical && !nextForecast) return "Waiting for enough live PM2.5 data to generate the chart.";
    return `Current: ${latestHistorical.toFixed(1)} µg/m³ · Next forecast: ${nextForecast.toFixed(1)} µg/m³`;
  }, [latestHistorical, nextForecast]);

  return (
    <section className="panel subtle-ring overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-200/70">AQI + Forecast</p>
            <h2 className="mt-1.5 text-xl font-semibold text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">{summaryText}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-border bg-slate-950/30 px-3 py-1.5 text-sm text-slate-100">
              Safe windows: {safeTimes.length}
            </div>
            <ExportButton chartRef={chartContainerRef} />
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {/* Chart area */}
        <div ref={chartContainerRef} className="h-[340px] rounded-[1.2rem] border border-border bg-slate-950/30 p-4">
          {error ? (
            <div className="flex h-full items-center justify-center rounded-[1rem] border border-rose-400/30 bg-rose-500/10 px-6 text-center text-sm text-rose-100">
              {error}
            </div>
          ) : loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-sm text-slate-400">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-300/20 border-t-sky-300" />
              Building your PM2.5 timeline…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartPoints} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="historicalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fcd34d" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#fcd34d" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" minTickGap={32} tick={{ fill: "#9fb2d4", fontSize: 11 }} axisLine={{ stroke: "rgba(148,163,184,0.12)" }} tickLine={false} />
                <YAxis tick={{ fill: "#9fb2d4", fontSize: 11 }} axisLine={{ stroke: "rgba(148,163,184,0.12)" }} tickLine={false} width={44} />
                <Tooltip
                  contentStyle={{ background: "#0d1928", borderColor: "rgba(148,163,184,0.15)", borderRadius: "14px", color: "#e2ecff", fontSize: 12 }}
                  formatter={(value) => {
                    const num = Number(Array.isArray(value) ? value[0] : value ?? 0);
                    return [`${num.toFixed(1)} µg/m³`, getPm25Category(num)];
                  }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#9fb2d4" }} />
                {/* AQI reference lines with labels */}
                <ReferenceLine y={50} stroke="#4ade80" strokeDasharray="5 4" strokeOpacity={0.7}>
                  <Label value="Good" position="insideRight" fill="#4ade80" fontSize={10} />
                </ReferenceLine>
                <ReferenceLine y={100} stroke="#fcd34d" strokeDasharray="5 4" strokeOpacity={0.7}>
                  <Label value="Moderate" position="insideRight" fill="#fcd34d" fontSize={10} />
                </ReferenceLine>
                <ReferenceLine y={200} stroke="#fb7185" strokeDasharray="5 4" strokeOpacity={0.7}>
                  <Label value="Poor" position="insideRight" fill="#fb7185" fontSize={10} />
                </ReferenceLine>
                <Area type="monotone" dataKey="historical" name="Historical" stroke="#38bdf8" strokeWidth={2.5} fill="url(#historicalFill)" dot={false} />
                <Area type="monotone" dataKey="forecast" name="Forecast" stroke="#fcd34d" strokeWidth={2} strokeDasharray="7 4" fill="url(#forecastFill)" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Safe times + snapshot */}
        <div className="grid gap-4 xl:grid-cols-[1.4fr_minmax(0,1fr)]">
          <div className="rounded-[1.2rem] border border-border bg-slate-950/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Safe Outdoor Windows</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {safeTimes.length ? safeTimes.map((w) => (
                <div key={`${w.start}-${w.end}`} className="rounded-full border border-border px-3 py-2 text-xs text-slate-100"
                  style={{ backgroundColor: `${getPm25Color(w.predicted_aqi)}14`, borderColor: `${getPm25Color(w.predicted_aqi)}45` }}>
                  {formatLocalTime(w.start)} → {formatLocalTime(w.end)}
                </div>
              )) : <p className="text-sm text-slate-500">No safer window in the next 24 hours.</p>}
            </div>
          </div>

          <div className="rounded-[1.2rem] border border-border bg-slate-950/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Forecast Snapshot</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <motion.div key={latestHistorical} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-border bg-card/80 p-3">
                <p className="text-xs text-slate-400">Latest PM2.5</p>
                <p className="mt-2 text-2xl font-bold text-white">{latestHistorical.toFixed(1)}</p>
                <p className="mt-0.5 text-xs" style={{ color: getPm25Color(latestHistorical) }}>{getPm25Category(latestHistorical)}</p>
              </motion.div>
              <motion.div key={nextForecast} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-border bg-card/80 p-3">
                <p className="text-xs text-slate-400">Next forecast</p>
                <p className="mt-2 text-2xl font-bold text-white">{nextForecast.toFixed(1)}</p>
                <p className="mt-0.5 text-xs" style={{ color: getPm25Color(nextForecast) }}>{getPm25Category(nextForecast)}</p>
              </motion.div>
            </div>
          </div>
        </div>

        {showWeekly && weeklySummary.length > 0 && (
          <div className="rounded-[1.2rem] border border-border bg-slate-950/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Weekly Outlook</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {weeklySummary.map((day, i) => (
                <motion.div key={day.date} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                  className="rounded-2xl border border-border bg-card/80 p-4">
                  <p className="text-xs text-slate-400">{day.date}</p>
                  <p className="mt-2 text-2xl font-bold text-white">{day.avg_pm25.toFixed(1)}</p>
                  <p className="mt-1.5 text-xs font-medium" style={{ color: getPm25Color(day.avg_pm25) }}>{day.risk_level}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{day.recommendation}</p>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
