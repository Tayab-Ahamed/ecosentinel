"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Area,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { HistoricalPoint, TimeWindow, WeeklySummary } from "@/lib/api";
import { ecoApi } from "@/lib/api";
import {
  buildDemoHistorical,
  DEMO_SAFE_TIMES,
  DEMO_WEEKLY,
} from "@/lib/demo-data";
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

export function AQIChart({
  lat,
  lon,
  title = "Air quality trend and forecast",
  showWeekly = false,
  demoMode = false,
}: AQIChartProps) {
  const [historical, setHistorical] = useState<HistoricalPoint[]>([]);
  const [safeTimes, setSafeTimes] = useState<TimeWindow[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary[]>([]);
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChartData = useCallback(async () => {
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
            historical: undefined,
            forecast: Math.min(220, Math.max(35, lastVal * 0.94 + i * 1.8)),
          });
        }
        const ordered = [...merged.values()].sort(
          (left, right) =>
            new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
        );
        setHistorical(history);
        setSafeTimes(DEMO_SAFE_TIMES);
        setWeeklySummary(DEMO_WEEKLY);
        setChartPoints(ordered);
        setError(null);
        return;
      }

      const nearest = await ecoApi.getNearestStations(lat, lon);
      const stationId = nearest.find((item) => item.station_id)?.station_id;

      if (!stationId) {
        throw new Error("No nearby station id available for charting.");
      }

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
        (left, right) =>
          new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
      );

      setHistorical(history);
      setSafeTimes(windows);
      setWeeklySummary(weekly);
      setChartPoints(ordered);
      setError(null);
    } catch (chartError) {
      const message =
        chartError instanceof Error
          ? chartError.message
          : "Unable to load chart data right now.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [lat, lon, demoMode]);

  useEffect(() => {
    void (async () => {
      await fetchChartData();
    })();
  }, [fetchChartData]);

  const latestHistorical = historical.at(-1)?.value ?? 0;
  const nextForecast = chartPoints.find((point) => point.forecast !== undefined)?.forecast ?? 0;

  const summaryText = useMemo(() => {
    if (!latestHistorical && !nextForecast) {
      return "Waiting for enough live PM2.5 data to generate the chart.";
    }

    return `Current trend sits near ${latestHistorical.toFixed(1)} ug/m3 and the next forecast window is ${nextForecast.toFixed(1)} ug/m3.`;
  }, [latestHistorical, nextForecast]);

  return (
    <section className="panel subtle-ring overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/70">
          AQI + Forecast
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">{summaryText}</p>
          </div>
          <div className="rounded-full border border-border bg-slate-950/30 px-3 py-1.5 text-sm text-slate-100">
            Safe windows: {safeTimes.length}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="h-[320px] rounded-[1.2rem] border border-border bg-slate-950/30 p-4">
          {error ? (
            <div className="flex h-full items-center justify-center rounded-[1rem] border border-rose-400/30 bg-rose-500/10 px-6 text-center text-sm text-rose-100">
              {error}
            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-300">
              Building your PM2.5 timeline...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartPoints}>
                <defs>
                  <linearGradient id="historicalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.06} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  minTickGap={28}
                  tick={{ fill: "#9fb2d4", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(148,163,184,0.18)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#9fb2d4", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(148,163,184,0.18)" }}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "#122034",
                    borderColor: "rgba(148,163,184,0.18)",
                    borderRadius: "16px",
                    color: "#e2ecff",
                  }}
                  formatter={(value) => {
                    const rawValue = Array.isArray(value) ? value[0] : value ?? 0;
                    const numericValue = Number(rawValue);
                    return [`${numericValue.toFixed(1)} ug/m3`, getPm25Category(numericValue)];
                  }}
                />
                <Legend />
                <ReferenceLine y={50} stroke="#4ade80" strokeDasharray="4 4" />
                <ReferenceLine y={100} stroke="#fcd34d" strokeDasharray="4 4" />
                <ReferenceLine y={200} stroke="#fb7185" strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="historical"
                  name="Historical"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  fill="url(#historicalFill)"
                  fillOpacity={1}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name="Forecast"
                  stroke="#fcd34d"
                  strokeWidth={2.5}
                  strokeDasharray="8 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_minmax(0,1fr)]">
          <div className="rounded-[1.2rem] border border-border bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Safe Outdoor Times
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {safeTimes.length ? (
                safeTimes.map((window) => (
                  <div
                    key={`${window.start}-${window.end}`}
                    className="rounded-full border border-border px-3 py-2 text-sm text-slate-100"
                    style={{
                      backgroundColor: `${getPm25Color(window.predicted_aqi)}18`,
                      borderColor: `${getPm25Color(window.predicted_aqi)}55`,
                    }}
                  >
                    {formatLocalTime(window.start)} - {formatLocalTime(window.end)}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">
                  No safer time window was found in the next 24 hours.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[1.2rem] border border-border bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Forecast Snapshot
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card/80 p-3">
                <p className="text-sm text-slate-400">Latest PM2.5</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {latestHistorical.toFixed(1)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-3">
                <p className="text-sm text-slate-400">Next forecast</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {nextForecast.toFixed(1)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {showWeekly ? (
          <div className="rounded-[1.2rem] border border-border bg-slate-950/30 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Weekly Outlook
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {weeklySummary.map((day) => (
                <div
                  key={day.date}
                  className="rounded-2xl border border-border bg-card/80 p-4"
                >
                  <p className="text-sm text-slate-400">{day.date}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {day.avg_pm25.toFixed(1)}
                  </p>
                  <p
                    className="mt-2 text-sm"
                    style={{ color: getPm25Color(day.avg_pm25) }}
                  >
                    {day.risk_level}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {day.recommendation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
