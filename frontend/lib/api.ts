import axios from "axios";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const API_ROOT = `${API_BASE_URL.replace(/\/$/, "")}/api`;
export const BENGALURU_LOCATION = {
  lat: 12.9716,
  lon: 77.5946,
  city: "Bengaluru",
} as const;

export type WasteType =
  | "plastic"
  | "paper"
  | "glass"
  | "metal"
  | "ewaste"
  | "medical"
  | "construction"
  | "organic"
  | "hazardous"
  | "mixed"
  | "unknown";

export interface LocationPayload {
  lat: number;
  lon: number;
  city: string;
}

export interface AirQualityReading {
  station_id?: number | null;
  location: LocationPayload;
  parameter: "pm25" | "co2" | "no2";
  value: number;
  unit: string;
  timestamp: string;
  source: "openaq";
}

export interface CityAirData {
  city_name: string;
  pm25: number;
  co2: number;
  no2: number;
  india_aqi: number;
  aqi_category: string;
}

export interface HistoricalPoint {
  timestamp: string;
  value: number;
  unit: string;
  parameter: string;
}

export interface IndiaHotspot {
  location_id: number;
  location_name: string;
  city: string;
  pm25: number;
  unit: string;
  timestamp: string;
}

export interface FireSummary {
  total_count: number;
  high_confidence_count: number;
  states_affected: string[];
  nearest_fire_to_bengaluru: {
    distance_km?: number;
    fire?: RealtimeFireEvent;
  };
}

export interface WasteClassification {
  waste_type: WasteType;
  confidence: number;
  environmental_impact_score: number;
  local_air_quality_correlation: string;
  disposal_recommendation: string;
}

export interface VoiceResponse {
  question_text?: string;
  question?: string;
  answer: string;
  data_used: string[];
  confidence: number;
  audio_base64?: string;
}

export interface ForecastPrediction {
  timestamp: string;
  pm25_predicted: number;
  confidence_interval_low: number;
  confidence_interval_high: number;
}

export interface AirQualityForecast {
  location: string;
  predictions: ForecastPrediction[];
  generated_at: string;
}

export interface TimeWindow {
  start: string;
  end: string;
  predicted_aqi: number;
  recommendation: string;
}

export interface WeeklySummary {
  date: string;
  avg_pm25: number;
  risk_level: string;
  recommendation: string;
}

export interface RealtimeFireEvent {
  latitude: number;
  longitude: number;
  brightness: number;
  scan: number;
  track: number;
  acq_date: string;
  acq_time: string;
  confidence: string;
  frp: number;
  source: "nasa_firms";
  distance_km?: number;
}

export interface GeoJsonPointGeometry {
  type: "Point";
  coordinates: [number, number];
}

export interface GeoJsonFeature<P> {
  type: "Feature";
  geometry: GeoJsonPointGeometry;
  properties: P;
}

export interface FeatureCollection<P> {
  type: "FeatureCollection";
  features: Array<GeoJsonFeature<P>>;
}

export interface FireFeatureProperties {
  confidence: string;
  frp: number;
  timestamp: string;
  brightness: number;
  severity_color: string;
}

export interface WasteHotspotProperties {
  id: number;
  waste_type: WasteType;
  severity: number;
  image_url?: string | null;
  reported_at: string;
}

export interface WasteImpactInfo {
  decompose_years: number;
  air_impact: string;
}

export type WasteImpactStats = Record<string, WasteImpactInfo>;

export interface RealtimeAlert {
  type: "alert";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  source: "air_quality" | "fire";
  timestamp: string;
}

export interface RealtimeAirPayload {
  type: "air_quality";
  city: string;
  timestamp: string;
  readings: AirQualityReading[];
}

export interface RealtimeFirePayload {
  type: "fire";
  city: string;
  timestamp: string;
  events: RealtimeFireEvent[];
}

const api = axios.create({
  baseURL: API_BASE_URL.replace(/\/$/, ""),
  timeout: 20_000,
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const detail =
        typeof error.response?.data?.detail === "string"
          ? error.response.data.detail
          : error.message;
      return Promise.reject(new Error(detail || "Request failed"));
    }

    return Promise.reject(new Error("Unexpected network error"));
  },
);

export function toWebSocketUrl(path: string): string {
  const base = new URL(API_BASE_URL);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = path;
  base.search = "";
  return base.toString();
}

export const ecoApi = {
  async getNearestStations(lat: number, lon: number): Promise<AirQualityReading[]> {
    const response = await api.get<AirQualityReading[]>("/api/air/nearest", {
      params: { lat, lon },
    });
    return response.data;
  },

  async getCityAirQuality(city: string): Promise<CityAirData> {
    const response = await api.get<CityAirData>(`/api/air/city/${encodeURIComponent(city)}`);
    return response.data;
  },

  async getHistoricalData(stationId: number, days = 7): Promise<HistoricalPoint[]> {
    const response = await api.get<HistoricalPoint[]>(`/api/air/historical/${stationId}`, {
      params: { days },
    });
    return response.data;
  },

  async getIndiaHotspots(): Promise<IndiaHotspot[]> {
    const response = await api.get<IndiaHotspot[]>("/api/air/india-hotspots");
    return response.data;
  },

  async getIndiaFires(): Promise<FeatureCollection<FireFeatureProperties>> {
    const response = await api.get<FeatureCollection<FireFeatureProperties>>("/api/fires/india");
    return response.data;
  },

  async getNearbyFires(lat: number, lon: number, radius = 100): Promise<FeatureCollection<FireFeatureProperties>> {
    const response = await api.get<FeatureCollection<FireFeatureProperties>>("/api/fires/near", {
      params: { lat, lon, radius },
    });
    return response.data;
  },

  async getFireSummary(): Promise<FireSummary> {
    const response = await api.get<FireSummary>("/api/fires/summary");
    return response.data;
  },

  async classifyWasteImage(formData: FormData): Promise<WasteClassification> {
    const response = await api.post<WasteClassification>("/api/waste/classify-image", formData);
    return response.data;
  },

  async classifyWasteUrl(payload: {
    image_url: string;
    lat: number;
    lon: number;
  }): Promise<WasteClassification> {
    const response = await api.post<WasteClassification>("/api/waste/classify-url", payload);
    return response.data;
  },

  async getWasteHotspots(): Promise<FeatureCollection<WasteHotspotProperties>> {
    const response = await api.get<FeatureCollection<WasteHotspotProperties>>("/api/waste/hotspots");
    return response.data;
  },

  async getWasteImpactStats(): Promise<WasteImpactStats> {
    const response = await api.get<WasteImpactStats>("/api/waste/impact-stats");
    return response.data;
  },

  async reportHotspot(payload: {
    lat: number;
    lon: number;
    waste_type: WasteType;
    severity: number;
    image_url: string | null;
  }): Promise<void> {
    await api.post("/api/waste/report-hotspot", payload);
  },

  async queryText(question: string, lat: number, lon: number, city: string): Promise<VoiceResponse> {
    const response = await api.post<VoiceResponse>("/api/voice/query-text", {
      question,
      lat,
      lon,
      city,
    });
    return response.data;
  },

  async queryAudio(formData: FormData): Promise<VoiceResponse> {
    const response = await api.post<VoiceResponse>("/api/voice/query-audio", formData);
    return response.data;
  },

  async getAirQualityForecast(
    lat: number,
    lon: number,
    hours = 24,
  ): Promise<AirQualityForecast> {
    const response = await api.get<AirQualityForecast>("/api/predict/air-quality", {
      params: { lat, lon, hours },
    });
    return response.data;
  },

  async getSafeOutdoorTimes(lat: number, lon: number): Promise<TimeWindow[]> {
    const response = await api.get<TimeWindow[]>("/api/predict/safe-outdoor-times", {
      params: { lat, lon },
    });
    return response.data;
  },

  async getWeeklySummary(lat: number, lon: number): Promise<WeeklySummary[]> {
    const response = await api.get<WeeklySummary[]>("/api/predict/weekly-summary", {
      params: { lat, lon },
    });
    return response.data;
  },
};
