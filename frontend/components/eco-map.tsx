"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { divIcon } from "leaflet";

import type {
  AirQualityReading,
  FeatureCollection,
  FireFeatureProperties,
  WasteHotspotProperties,
} from "@/lib/api";
import { ecoApi } from "@/lib/api";
import { formatLocalTime, getPm25Category, getPm25Color } from "@/lib/environment";
import { MapIcon, RefreshIcon } from "@/components/icons";

interface EcoMapProps {
  lat: number;
  lon: number;
  className?: string;
}

const wasteMarker = divIcon({
  className: "waste-marker",
  html: `<div style="width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:18px solid #f59e0b;filter:drop-shadow(0 8px 18px rgba(245,158,11,0.45));"></div>`,
  iconSize: [20, 18],
  iconAnchor: [10, 18],
});

function RecenterMap({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: true });
  }, [lat, lon, map]);

  return null;
}

export function EcoMap({ lat, lon, className }: EcoMapProps) {
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
  });

  const fetchMapData = useCallback(async () => {
    setLoading(true);
    try {
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
  }, [lat, lon]);

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
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.22em] text-sky-200/70">
            <MapIcon className="h-4 w-4" />
            Interactive Map
          </div>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Live air, fire, and waste layers around your location
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
            className="inline-flex items-center gap-2 rounded-full border border-border bg-slate-950/30 px-3 py-1.5 text-sm text-slate-100 transition hover:border-sky-400/40 hover:bg-slate-900"
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
                tint: "#38bdf8",
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
                  className="h-4 w-4 accent-sky-400"
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
              The map auto-refreshes every minute and centers on Bengaluru by
              default when geolocation is unavailable.
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
                return (
                  <Marker
                    key={`${feature.properties.id}-${feature.properties.reported_at}`}
                    position={[featureLat, featureLon]}
                    icon={wasteMarker}
                  >
                    <Popup>
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-900">
                          {feature.properties.waste_type.toUpperCase()}
                        </p>
                        <p>Severity: {feature.properties.severity}/5</p>
                        <p>{formatLocalTime(feature.properties.reported_at)}</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
          </MapContainer>

          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
              <div className="rounded-full border border-sky-300/25 bg-slate-900/90 px-4 py-2 text-sm text-sky-100">
                Loading live layers...
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
