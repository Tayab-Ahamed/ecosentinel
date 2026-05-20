"""Air quality API routes."""

from fastapi import APIRouter, Depends, HTTPException, Query

from models.schemas import (
    AQICategoryResponse,
    AirQualityReading,
    CityAverageResponse,
    HistoricalReading,
    IndiaHotspot,
)
from services.openaq_client import OpenAQClient

router: APIRouter = APIRouter(prefix="/air", tags=["air-quality"])
openaq_client: OpenAQClient = OpenAQClient()


def get_openaq_client() -> OpenAQClient:
    """Dependency provider for OpenAQ client."""
    return openaq_client


def pm25_to_india_aqi(pm25: float) -> tuple[int, str]:
    """Convert PM2.5 to India AQI bucket and category."""
    bounded_pm25 = max(0.0, pm25)
    india_aqi = int(min(500.0, round(bounded_pm25)))
    if india_aqi <= 50:
        return india_aqi, "Good"
    if india_aqi <= 100:
        return india_aqi, "Satisfactory"
    if india_aqi <= 200:
        return india_aqi, "Moderate"
    if india_aqi <= 300:
        return india_aqi, "Poor"
    if india_aqi <= 400:
        return india_aqi, "Very Poor"
    return india_aqi, "Severe"


@router.get("/nearest", response_model=list[AirQualityReading])
async def get_nearest_air_quality(
    lat: float = Query(..., description="Latitude for nearest station search."),
    lon: float = Query(..., description="Longitude for nearest station search."),
    client: OpenAQClient = Depends(get_openaq_client),
) -> list[AirQualityReading]:
    """Return latest readings from nearest stations."""
    try:
        stations = await client.get_nearest_stations(lat=lat, lon=lon)
        station_ids = [int(station["id"]) for station in stations if "id" in station]
        if not station_ids:
            return []
        return await client.get_latest_readings(station_ids=station_ids)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch nearest readings: {exc}"
        ) from exc


@router.get("/city/{city_name}", response_model=CityAverageResponse)
async def get_city_air_summary(
    city_name: str,
    client: OpenAQClient = Depends(get_openaq_client),
) -> CityAverageResponse:
    """Return city average pollutant readings and AQI category."""
    try:
        averages = await client.get_city_average(city_name=city_name)
        pm25 = float(averages.get("pm25", 0.0))
        india_aqi, aqi_category = pm25_to_india_aqi(pm25=pm25)
        return CityAverageResponse(
            city_name=city_name,
            pm25=pm25,
            co2=float(averages.get("co2", 0.0)),
            no2=float(averages.get("no2", 0.0)),
            india_aqi=india_aqi,
            aqi_category=aqi_category,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch city averages: {exc}"
        ) from exc


@router.get("/india-hotspots", response_model=list[IndiaHotspot])
async def get_india_hotspots(
    client: OpenAQClient = Depends(get_openaq_client),
) -> list[IndiaHotspot]:
    """Return top 10 most polluted PM2.5 locations in India."""
    try:
        hotspots = await client.get_india_hotspots()
        return [IndiaHotspot(**item) for item in hotspots]
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch India hotspots: {exc}"
        ) from exc


@router.get("/historical/{station_id}", response_model=list[HistoricalReading])
async def get_historical_air_data(
    station_id: int,
    days: int = Query(default=7, ge=1, le=90),
    parameter: str = Query(default="pm25", description="Pollutant parameter (pm25/co2/no2)."),
    client: OpenAQClient = Depends(get_openaq_client),
) -> list[HistoricalReading]:
    """Return historical measurements for chart rendering."""
    try:
        raw = await client.get_historical_data(
            station_id=station_id, parameter=parameter, days=days
        )
        points: list[HistoricalReading] = []
        for item in raw:
            dt = item.get("datetime") or item.get("date") or {}
            ts_value = dt.get("utc") if isinstance(dt, dict) else dt
            points.append(
                HistoricalReading(
                    timestamp=ts_value or "",
                    value=float(item.get("value", 0.0)),
                    unit=str(item.get("unit", "ug/m3")),
                    parameter=str(item.get("parameter", parameter)),
                )
            )
        return points
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch historical data: {exc}"
        ) from exc


@router.get("/aqi-category", response_model=AQICategoryResponse)
async def get_aqi_category(pm25: float = Query(..., ge=0.0)) -> AQICategoryResponse:
    """Return AQI category based on PM2.5 under India AQI scale."""
    india_aqi, category = pm25_to_india_aqi(pm25=pm25)
    return AQICategoryResponse(pm25=pm25, india_aqi=india_aqi, category=category)
