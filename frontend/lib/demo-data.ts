/**
 * Sample data for demo mode when live API keys are not configured.
 * Toggle via the sidebar in the app shell.
 */

import type {
  AirQualityReading,
  FeatureCollection,
  FireFeatureProperties,
  FireSummary,
  HistoricalPoint,
  IndiaHotspot,
  RealtimeAlert,
  TimeWindow,
  WasteHotspotProperties,
  WeeklySummary,
} from "@/lib/api";
import { BENGALURU_LOCATION } from "@/lib/api";

const now = () => new Date().toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

export const DEMO_AIR_READINGS: AirQualityReading[] = [
  {
    station_id: 90001,
    location: {
      lat: BENGALURU_LOCATION.lat + 0.04,
      lon: BENGALURU_LOCATION.lon - 0.02,
      city: "Bengaluru (Indiranagar)",
    },
    parameter: "pm25",
    value: 118,
    unit: "µg/m³",
    timestamp: now(),
    source: "openaq",
  },
  {
    station_id: 90002,
    location: {
      lat: BENGALURU_LOCATION.lat - 0.06,
      lon: BENGALURU_LOCATION.lon + 0.03,
      city: "Bengaluru (Electronic City)",
    },
    parameter: "pm25",
    value: 86,
    unit: "µg/m³",
    timestamp: hoursAgo(1),
    source: "openaq",
  },
  {
    station_id: 90003,
    location: {
      lat: BENGALURU_LOCATION.lat + 0.02,
      lon: BENGALURU_LOCATION.lon + 0.05,
      city: "Bengaluru (Whitefield)",
    },
    parameter: "pm25",
    value: 142,
    unit: "µg/m³",
    timestamp: hoursAgo(2),
    source: "openaq",
  },
];

export const DEMO_INDIA_HOTSPOTS: IndiaHotspot[] = [
  {
    location_id: 7001,
    location_name: "ITO Crossing",
    city: "Delhi",
    pm25: 210,
    unit: "µg/m³",
    timestamp: hoursAgo(3),
  },
  {
    location_id: 7002,
    location_name: "Sector 18",
    city: "Noida",
    pm25: 186,
    unit: "µg/m³",
    timestamp: hoursAgo(4),
  },
  {
    location_id: 7003,
    location_name: "Whitefield",
    city: "Bengaluru",
    pm25: 142,
    unit: "µg/m³",
    timestamp: hoursAgo(1),
  },
];

export const DEMO_FIRE_SUMMARY: FireSummary = {
  total_count: 24,
  high_confidence_count: 8,
  states_affected: ["Karnataka", "Maharashtra", "Telangana", "Odisha"],
  nearest_fire_to_bengaluru: {
    distance_km: 112,
    fire: undefined,
  },
};

export const DEMO_FIRES_INDIA: FeatureCollection<FireFeatureProperties> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [77.48, 13.15] },
      properties: {
        confidence: "high",
        frp: 38,
        timestamp: hoursAgo(2),
        brightness: 305,
        severity_color: "#fb7185",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [77.62, 12.88] },
      properties: {
        confidence: "nominal",
        frp: 18,
        timestamp: hoursAgo(5),
        brightness: 240,
        severity_color: "#f97316",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [77.35, 13.05] },
      properties: {
        confidence: "low",
        frp: 9,
        timestamp: hoursAgo(8),
        brightness: 180,
        severity_color: "#fbbf24",
      },
    },
  ],
};

export const DEMO_WASTE_HOTSPOTS: FeatureCollection<WasteHotspotProperties> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [BENGALURU_LOCATION.lon + 0.02, BENGALURU_LOCATION.lat + 0.01] },
      properties: {
        id: 501,
        waste_type: "plastic",
        severity: 4,
        reported_at: hoursAgo(6),
        image_url: null,
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [BENGALURU_LOCATION.lon - 0.03, BENGALURU_LOCATION.lat - 0.02] },
      properties: {
        id: 502,
        waste_type: "organic",
        severity: 3,
        reported_at: hoursAgo(12),
        image_url: null,
      },
    },
  ],
};

export const DEMO_ALERTS: RealtimeAlert[] = [
  {
    type: "alert",
    severity: "warning",
    title: "Elevated PM2.5 in your corridor",
    message:
      "Several stations report PM2.5 above 100 µg/m³. Consider limiting strenuous outdoor activity during peak hours.",
    source: "air_quality",
    timestamp: now(),
  },
  {
    type: "alert",
    severity: "warning",
    title: "Satellite fire detections nearby",
    message:
      "NASA FIRMS-style hotspots are visible within ~150 km. Smoke can worsen local air quality depending on wind.",
    source: "fire",
    timestamp: hoursAgo(1),
  },
  {
    type: "alert",
    severity: "info",
    title: "Community waste reports",
    message: "New mixed-waste reports were added near your map center. Review hotspots before field visits.",
    source: "air_quality",
    timestamp: hoursAgo(3),
  },
];

/** Synthetic historical points for chart (last 48h hourly). */
export function buildDemoHistorical(): HistoricalPoint[] {
  const points: HistoricalPoint[] = [];
  for (let h = 48; h >= 0; h--) {
    const t = new Date(Date.now() - h * 3600 * 1000).toISOString();
    const base = 75 + Math.sin(h / 6) * 25 + (h % 7) * 3;
    points.push({
      timestamp: t,
      value: Math.round(base * 10) / 10,
      unit: "µg/m³",
      parameter: "pm25",
    });
  }
  return points;
}

export const DEMO_SAFE_TIMES: TimeWindow[] = [
  {
    start: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    end: new Date(Date.now() + 10 * 3600 * 1000).toISOString(),
    predicted_aqi: 62,
    recommendation: "Better window for a walk or jog.",
  },
  {
    start: new Date(Date.now() + 22 * 3600 * 1000).toISOString(),
    end: new Date(Date.now() + 28 * 3600 * 1000).toISOString(),
    predicted_aqi: 48,
    recommendation: "Lowest predicted PM2.5 in the next day.",
  },
];

export const DEMO_WEEKLY: WeeklySummary[] = [
  { date: "Mon", avg_pm25: 102, risk_level: "Unhealthy for sensitive", recommendation: "Masks advised for sensitive groups." },
  { date: "Tue", avg_pm25: 94, risk_level: "Moderate", recommendation: "Outdoor work OK with breaks." },
  { date: "Wed", avg_pm25: 88, risk_level: "Moderate", recommendation: "Air trending cleaner mid-week." },
  { date: "Thu", avg_pm25: 110, risk_level: "Unhealthy for sensitive", recommendation: "Limit long outdoor sessions." },
];
