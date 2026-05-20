"""Air quality prediction routes powered by Prophet."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from models.schemas import AirQualityForecast
from services.openaq_client import OpenAQClient
from services.prophet_model import ProphetModelService

router: APIRouter = APIRouter(prefix="/predict", tags=["prediction"])
openaq_client: OpenAQClient = OpenAQClient()
prophet_model: ProphetModelService = ProphetModelService()
prophet_service: ProphetModelService = prophet_model


class SafeOutdoorWindow(BaseModel):
    """Safe or satisfactory outdoor activity time window."""

    start: datetime
    end: datetime
    predicted_aqi: float
    recommendation: str


class WeeklyForecastSummary(BaseModel):
    """Daily aggregate view of forecasted air quality."""

    date: str
    avg_pm25: float
    risk_level: str
    recommendation: str


def get_openaq_client() -> OpenAQClient:
    """Dependency provider for OpenAQ client."""
    return openaq_client


def get_prophet_model() -> ProphetModelService:
    """Dependency provider for Prophet prediction service."""
    return prophet_model


async def _nearest_station_id(client: OpenAQClient, lat: float, lon: float) -> int:
    """Find nearest OpenAQ station id for coordinates."""
    stations = await client.get_nearest_stations(lat=lat, lon=lon)
    if not stations:
        raise HTTPException(status_code=404, detail="No nearby air quality station found.")
    station_id = stations[0].get("id")
    if station_id is None:
        raise HTTPException(status_code=404, detail="Nearest station has no valid ID.")
    return int(station_id)


@router.get("/air-quality", response_model=AirQualityForecast)
async def predict_air_quality(
    lat: float = Query(..., description="Latitude for nearest station selection."),
    lon: float = Query(..., description="Longitude for nearest station selection."),
    hours: int = Query(default=24, ge=1, le=168),
    aq_client: OpenAQClient = Depends(get_openaq_client),
    predictor: ProphetModelService = Depends(get_prophet_model),
) -> AirQualityForecast:
    """Return hour-level PM2.5 forecast from nearest station model."""
    try:
        station_id = await _nearest_station_id(aq_client, lat=lat, lon=lon)
        return await predictor.predict_air_quality(station_id=station_id, hours_ahead=hours)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}") from exc


@router.get("/safe-outdoor-times", response_model=list[SafeOutdoorWindow])
async def get_safe_outdoor_times(
    lat: float = Query(...),
    lon: float = Query(...),
    aq_client: OpenAQClient = Depends(get_openaq_client),
    predictor: ProphetModelService = Depends(get_prophet_model),
) -> list[SafeOutdoorWindow]:
    """Return contiguous windows where AQI stays in Good/Satisfactory range."""
    try:
        station_id = await _nearest_station_id(aq_client, lat=lat, lon=lon)
        forecast = await predictor.predict_air_quality(station_id=station_id, hours_ahead=24)
        windows: list[SafeOutdoorWindow] = []

        current_start: datetime | None = None
        collected_values: list[float] = []
        latest_ts: datetime | None = None
        for point in forecast.predictions:
            predicted_aqi = max(0.0, min(500.0, point.pm25_predicted))
            is_good_or_satisfactory = predicted_aqi <= 100.0
            if is_good_or_satisfactory:
                if current_start is None:
                    current_start = point.timestamp
                    collected_values = []
                collected_values.append(predicted_aqi)
                latest_ts = point.timestamp
            elif current_start is not None and latest_ts is not None:
                avg_aqi = sum(collected_values) / len(collected_values) if collected_values else 0.0
                windows.append(
                    SafeOutdoorWindow(
                        start=current_start,
                        end=latest_ts,
                        predicted_aqi=round(avg_aqi, 2),
                        recommendation=(
                            "Good window for walking, jogging, or commuting outdoors."
                            if avg_aqi <= 50
                            else "Conditions are acceptable; reduce strenuous activity if sensitive."
                        ),
                    )
                )
                current_start = None
                collected_values = []
                latest_ts = None

        if current_start is not None and latest_ts is not None:
            avg_aqi = sum(collected_values) / len(collected_values) if collected_values else 0.0
            windows.append(
                SafeOutdoorWindow(
                    start=current_start,
                    end=latest_ts,
                    predicted_aqi=round(avg_aqi, 2),
                    recommendation=(
                        "Good window for walking, jogging, or commuting outdoors."
                        if avg_aqi <= 50
                        else "Conditions are acceptable; reduce strenuous activity if sensitive."
                    ),
                )
            )
        return windows
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Safe time calculation failed: {exc}") from exc


@router.get("/weekly-summary", response_model=list[WeeklyForecastSummary])
async def get_weekly_summary(
    lat: float = Query(...),
    lon: float = Query(...),
    aq_client: OpenAQClient = Depends(get_openaq_client),
    predictor: ProphetModelService = Depends(get_prophet_model),
) -> list[WeeklyForecastSummary]:
    """Return 7-day PM2.5 summary with risk labels and recommendations."""
    try:
        station_id = await _nearest_station_id(aq_client, lat=lat, lon=lon)
        forecast = await predictor.predict_air_quality(station_id=station_id, hours_ahead=24 * 7)
        if not forecast.predictions:
            return []

        grouped: dict[str, list[float]] = {}
        for point in forecast.predictions:
            day_key = point.timestamp.astimezone(UTC).date().isoformat()
            grouped.setdefault(day_key, []).append(point.pm25_predicted)

        summary: list[WeeklyForecastSummary] = []
        for day_key in sorted(grouped.keys()):
            avg_pm25 = sum(grouped[day_key]) / len(grouped[day_key])
            risk = predictor.get_aqi_risk_level(avg_pm25)
            if risk == "Safe to go out":
                recommendation = "Plan outdoor activities during this day."
            elif risk == "Limit outdoor activity":
                recommendation = "Prefer shorter outdoor exposure and avoid peak traffic zones."
            elif risk == "Avoid outdoor activity":
                recommendation = "Use a mask outdoors and avoid intense exercise."
            else:
                recommendation = (
                    "Stay indoors, keep windows closed, and use air filtration if possible."
                )
            summary.append(
                WeeklyForecastSummary(
                    date=day_key,
                    avg_pm25=round(avg_pm25, 2),
                    risk_level=risk,
                    recommendation=recommendation,
                )
            )
        return summary
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Weekly summary failed: {exc}") from exc
