"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, FeatureGroup } from "react-leaflet";
import { divIcon } from "leaflet";

import type {
  AirQualityReading,
  FeatureCollection,
  FireFeatureProperties,
  WasteHotspotProperties,
} from "@/lib/api";
import { ecoApi } from "@/lib/api";
import {
  DEMO_AIR_READINGS,
  DEMO_FIRES_INDIA,
  DEMO_WASTE_HOTSPOTS,
} from "@/lib/demo-data";
import { formatLocalTime, getPm25Category, getPm25Color } from "@/lib/environment";
import { MapIcon, RefreshIcon } from "@/components/icons";

interface EcoMapProps {
  lat: number;
  lon: number;
  className?: string;
  /** When true, show sample layers (no live OpenAQ/FIRMS). */
  demoMode?: boolean;
}

const activeWasteMarker = divIcon({
  className: "waste-marker-active",
  html: `<div style="width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:18px solid #f59e0b;filter:drop-shadow(0 8px 18px rgba(245,158,11,0.45));"></div>`,
  iconSize: [20, 18],
  iconAnchor: [10, 18],
});

const cleanedWasteMarker = divIcon({
  className: "waste-marker-cleaned",
  html: `<div style="width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:18px solid #10b981;filter:drop-shadow(0 8px 18px rgba(16,185,129,0.45));"></div>`,
  iconSize: [20, 18],
  iconAnchor: [10, 18],
});

interface WastePopupContentProps {
  hotspot: WasteHotspotProperties;
  onVerified: () => void;
}

function WastePopupContent({ hotspot, onVerified }: WastePopupContentProps) {
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
      const res = await ecoApi.verifyCleanup(hotspot.id, formData);
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
    <div className="w-[260px] p-1 font-sans text-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-slate-900">
          {hotspot.waste_type} Waste
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
            hotspot.status === "cleaned"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {hotspot.status}
        </span>
      </div>

      <div className="my-2 space-y-2">
        {hotspot.status === "cleaned" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1">
              {hotspot.image_base64 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400">Before</span>
                  <img
                    src={hotspot.image_base64}
                    alt="Before"
                    className="h-16 w-full rounded border border-slate-200 object-cover"
                  />
                </div>
              )}
              {hotspot.cleanup_image_base64 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400">After</span>
                  <img
                    src={hotspot.cleanup_image_base64}
                    alt="After"
                    className="h-16 w-full rounded border border-slate-200 object-cover"
                  />
                </div>
              )}
            </div>
            <div className="rounded bg-emerald-50 p-2 text-xs text-emerald-800">
              <p className="font-semibold text-emerald-950">🏆 AI Cleanup Verified</p>
              <p className="mt-0.5 text-emerald-700">+{hotspot.eco_points_awarded} Eco Points Awarded!</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {hotspot.image_base64 && (
              <img
                src={hotspot.image_base64}
                alt="Reported Waste"
                className="h-32 w-full rounded-lg border border-slate-200 object-cover"
              />
            )}
            <div className="flex justify-between text-xs text-slate-600">
              <span>Severity Level:</span>
              <span className="font-semibold text-slate-900">{hotspot.severity}/5</span>
            </div>
            <div className="text-[10px] text-slate-400">
              Reported: {new Date(hotspot.reported_at).toLocaleString()}
            </div>

            {!result?.success && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Clean this site and earn points!
                </label>
                <div className="relative flex items-center justify-center rounded-lg border border-dashed border-secondary bg-secondary/5 hover:bg-secondary/10 transition cursor-pointer p-2 text-center text-xs">
                  {uploading ? (
                    <span className="text-secondary flex items-center gap-1">
                      <span className="animate-spin text-secondary">&#9696;</span> Verifying...
                    </span>
                  ) : (
                    <span className="text-secondary font-medium">Upload cleanup photo</span>
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
        )}

        {error && (
          <div className="rounded bg-rose-50 p-1.5 text-xs text-rose-700 font-medium">
            ❌ {error}
          </div>
        )}

        {result && (
          <div
            className={`rounded p-2 text-xs ${
              result.success
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            <p className="font-semibold">{result.success ? "🎉 Cleaned!" : "⚠️ Verification Failed"}</p>
            <p className="mt-0.5 text-xs">{result.message}</p>
            {result.feedback && (
              <p className="mt-1 text-[10px] italic text-slate-500">AI Feedback: &quot;{result.feedback}&quot;</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function RecenterMap({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: true });
  }, [lat, lon, map]);

  return null;
}

export function EcoMap({ lat, lon, className, demoMode = false }: EcoMapProps) {
  const [airReadings, setAirReadings] = useState<AirQualityReading[]>([]);
  const [fireFeatures, setFireFeatures] =
    useState<FeatureCollection<FireFeatureProperties> | null>(null);
  const [wasteFeatures, setWasteFeatures] =
    useState<FeatureCollection<WasteHotspotProperties> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState({
    air: true,
    fire: true,
    waste: true,
    smoke: true,
  });

  const fetchMapData = useCallback(async () => {
    setLoading(true);
    try {
      if (demoMode) {
        setAirReadings(DEMO_AIR_READINGS);
        setFireFeatures(DEMO_FIRES_INDIA);
        setWasteFeatures(DEMO_WASTE_HOTSPOTS);
        setError(null);
        return;
      }
      const [air, fires, waste] = await Promise.all([
        ecoApi.getNearestStations(lat, lon),
        ecoApi.getIndiaFires(),
        ecoApi.getWasteHotspots(),
      ]);
      setAirReadings(air);
      setFireFeatures(fires);
      setWasteFeatures(waste);
      setError(null);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Unable to load live layers right now.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [lat, lon, demoMode]);

  useEffect(() => {
    void (async () => {
      await fetchMapData();
    })();
    const intervalId = window.setInterval(() => {
      void fetchMapData();
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchMapData]);

  const fireCount = fireFeatures?.features.length ?? 0;
  const wasteCount = wasteFeatures?.features.length ?? 0;

  const summary = useMemo(
    () => [
      { label: "Air nodes", value: airReadings.length },
      { label: "Fire points", value: fireCount },
      { label: "Waste reports", value: wasteCount },
    ],
    [airReadings.length, fireCount, wasteCount],
  );

  return (
    <section className={`panel subtle-ring overflow-hidden ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.22em] text-secondary/70">
            <MapIcon className="h-4 w-4" />
            Interactive Map
          </div>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {demoMode ? "Sample layers (demo)" : "Live air, fire, and waste layers around your location"}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {summary.map((item) => (
            <div
              key={item.label}
              className="rounded-full border border-border bg-slate-950/30 px-3 py-1.5 text-xs text-slate-300"
            >
              {item.label}: <span className="font-semibold text-white">{item.value}</span>
            </div>
          ))}
          <button
            type="button"
            onClick={() => void fetchMapData()}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-slate-950/30 px-3 py-1.5 text-sm text-slate-100 transition hover:border-secondary/40 hover:bg-slate-900"
          >
            <RefreshIcon className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-[1.1rem] border border-border bg-slate-950/30 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
            Layers
          </p>
          <div className="mt-4 space-y-3">
            {[
              {
                key: "air" as const,
                label: "Air quality",
                tint: "#4cd7f6",
              },
              {
                key: "fire" as const,
                label: "Fire activity",
                tint: "#fb7185",
              },
              {
                key: "waste" as const,
                label: "Waste hotspots",
                tint: "#f59e0b",
              },
              {
                key: "smoke" as const,
                label: "Smoke Plumes",
                tint: "#eab308",
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-center justify-between rounded-2xl border border-border bg-card/70 px-3 py-2.5"
              >
                <span className="flex items-center gap-3 text-sm text-slate-100">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.tint }}
                  />
                  {item.label}
                </span>
                <input
                  type="checkbox"
                  checked={layers[item.key]}
                  onChange={() =>
                    setLayers((current) => ({
                      ...current,
                      [item.key]: !current[item.key],
                    }))
                  }
                  className="h-4 w-4 accent-secondary"
                />
              </label>
            ))}
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              {error}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-slate-400">
              {demoMode
                ? "Demo mode uses static sample points so judges can explore the UI without API keys."
                : "The map auto-refreshes every minute and centers on Bengaluru by default when geolocation is unavailable."}
            </p>
          )}
        </aside>

        <div className="relative min-h-[460px] overflow-hidden rounded-[1.2rem] border border-border bg-slate-950/20">
          <MapContainer
            center={[lat, lon]}
            zoom={10}
            scrollWheelZoom
            className="h-[460px] w-full"
          >
            <RecenterMap lat={lat} lon={lon} />
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {layers.air &&
              airReadings.map((reading) => (
                <CircleMarker
                  key={`${reading.station_id ?? "station"}-${reading.timestamp}`}
                  center={[reading.location.lat, reading.location.lon]}
                  radius={10}
                  pathOptions={{
                    color: getPm25Color(reading.value),
                    fillColor: getPm25Color(reading.value),
                    fillOpacity: 0.45,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">
                        {reading.location.city}
                      </p>
                      <p>PM2.5: {reading.value.toFixed(1)} ug/m3</p>
                      <p>{getPm25Category(reading.value)}</p>
                      <p>{formatLocalTime(reading.timestamp)}</p>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

            {layers.smoke &&
              layers.fire &&
              fireFeatures?.features.map((feature) => {
                const [featureLon, featureLat] = feature.geometry.coordinates;
                const baseRadius = Math.max(6, Math.min(16, feature.properties.frp / 8));
                const windDx = 0.012;
                const windDy = 0.012;
                return (
                  <FeatureGroup key={`smoke-plume-${featureLon}-${featureLat}-${feature.properties.timestamp}`}>
                    <CircleMarker
                      center={[featureLat + windDy * 0.4, featureLon + windDx * 0.4]}
                      radius={baseRadius * 2.0}
                      pathOptions={{
                        color: "rgba(234, 179, 8, 0.22)",
                        fillColor: "rgba(234, 179, 8, 0.22)",
                        fillOpacity: 0.22,
                        weight: 0,
                      }}
                    />
                    <CircleMarker
                      center={[featureLat + windDy * 1.0, featureLon + windDx * 1.0]}
                      radius={baseRadius * 3.8}
                      pathOptions={{
                        color: "rgba(234, 179, 8, 0.12)",
                        fillColor: "rgba(234, 179, 8, 0.12)",
                        fillOpacity: 0.12,
                        weight: 0,
                      }}
                    />
                    <CircleMarker
                      center={[featureLat + windDy * 1.8, featureLon + windDx * 1.8]}
                      radius={baseRadius * 6.0}
                      pathOptions={{
                        color: "rgba(234, 179, 8, 0.05)",
                        fillColor: "rgba(234, 179, 8, 0.05)",
                        fillOpacity: 0.05,
                        weight: 0,
                      }}
                    />
                  </FeatureGroup>
                );
              })}

            {layers.fire &&
              fireFeatures?.features.map((feature) => {
                const [featureLon, featureLat] = feature.geometry.coordinates;
                const radius = Math.max(6, Math.min(16, feature.properties.frp / 8));
                return (
                  <CircleMarker
                    key={`${featureLon}-${featureLat}-${feature.properties.timestamp}`}
                    center={[featureLat, featureLon]}
                    radius={radius}
                    pathOptions={{
                      color: feature.properties.severity_color,
                      fillColor: feature.properties.severity_color,
                      fillOpacity: 0.48,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-900">Fire alert</p>
                        <p>Confidence: {feature.properties.confidence}</p>
                        <p>Brightness: {feature.properties.brightness.toFixed(1)}</p>
                        <p>FRP: {feature.properties.frp.toFixed(1)}</p>
                        <p>{formatLocalTime(feature.properties.timestamp)}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

            {layers.waste &&
              wasteFeatures?.features.map((feature) => {
                const [featureLon, featureLat] = feature.geometry.coordinates;
                const isCleaned = feature.properties.status === "cleaned";
                return (
                  <Marker
                    key={`${feature.properties.id}-${feature.properties.reported_at}`}
                    position={[featureLat, featureLon]}
                    icon={isCleaned ? cleanedWasteMarker : activeWasteMarker}
                  >
                    <Popup>
                      <WastePopupContent hotspot={feature.properties} onVerified={fetchMapData} />
                    </Popup>
                  </Marker>
                );
              })}
          </MapContainer>

          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
              <div className="rounded-full border border-secondary/25 bg-slate-900/90 px-4 py-2 text-sm text-secondary">
                Loading live layers...
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
