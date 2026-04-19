"""Pydantic v2 schemas for EcoSentinel backend."""

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class Location(BaseModel):
    """Geographic location details."""

    lat: float
    lon: float
    city: str


class AirParameter(str, Enum):
    """Supported air quality parameters."""

    PM25 = "pm25"
    CO2 = "co2"
    NO2 = "no2"


class AirQualityReading(BaseModel):
    """Air quality reading schema."""

    station_id: int | None = None
    location: Location
    parameter: AirParameter
    value: float
    unit: str
    timestamp: datetime
    source: Literal["openaq"] = "openaq"


class FireEvent(BaseModel):
    """Wildfire detection event schema."""

    latitude: float
    longitude: float
    brightness: float
    scan: float
    track: float
    acq_date: str
    acq_time: str
    confidence: str
    frp: float
    source: Literal["nasa_firms"] = "nasa_firms"


class WasteType(str, Enum):
    """Supported waste categories."""

    PLASTIC = "plastic"
    PAPER = "paper"
    GLASS = "glass"
    METAL = "metal"
    EWASTE = "ewaste"
    MEDICAL = "medical"
    CONSTRUCTION = "construction"
    ORGANIC = "organic"
    HAZARDOUS = "hazardous"
    MIXED = "mixed"
    UNKNOWN = "unknown"


class WasteClassification(BaseModel):
    """Waste classification output schema."""

    waste_type: WasteType
    confidence: float = Field(ge=0.0, le=1.0)
    environmental_impact_score: float = Field(ge=0.0, le=10.0)
    local_air_quality_correlation: str
    disposal_recommendation: str


class VoiceQuery(BaseModel):
    """Incoming voice query schema."""

    audio_base64: str
    location: dict[str, Any]


class VoiceResponse(BaseModel):
    """Voice agent response schema."""

    question_text: str
    answer: str
    data_used: list[str]
    confidence: float = Field(ge=0.0, le=1.0)


class ForecastPrediction(BaseModel):
    """Single predicted air quality point."""

    timestamp: datetime
    pm25_predicted: float
    confidence_interval_low: float
    confidence_interval_high: float


class AirQualityForecast(BaseModel):
    """Air quality forecast schema."""

    location: str
    predictions: list[ForecastPrediction]
    generated_at: datetime


class AQICategoryResponse(BaseModel):
    """AQI category mapping response."""

    pm25: float
    india_aqi: int = Field(ge=0, le=500)
    category: str


class CityAverageResponse(BaseModel):
    """City average pollutants with AQI category."""

    city_name: str
    pm25: float
    co2: float
    no2: float
    india_aqi: int = Field(ge=0, le=500)
    aqi_category: str


class IndiaHotspot(BaseModel):
    """Top polluted location summary."""

    location_id: int
    location_name: str
    city: str
    pm25: float
    unit: str
    timestamp: datetime | str


class HistoricalReading(BaseModel):
    """Historical measurement point for charting."""

    timestamp: datetime | str
    value: float
    unit: str
    parameter: str


class FireSummary(BaseModel):
    """Aggregated fire activity summary."""

    total_count: int
    high_confidence_count: int
    states_affected: list[str]
    nearest_fire_to_bengaluru: dict[str, Any]
