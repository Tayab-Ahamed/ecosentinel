"""NASA FIRMS fire data API routes."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from models.schemas import AirQualityReading, FireEvent, FireSummary
from services.firms_client import FIRMSClient
from services.openaq_client import OpenAQClient

router: APIRouter = APIRouter(prefix="/fires", tags=["fire-data"])
firms_client: FIRMSClient = FIRMSClient()
openaq_client: OpenAQClient = OpenAQClient()


def get_firms_client() -> FIRMSClient:
    """Dependency provider for FIRMS client."""
    return firms_client


def get_openaq_client() -> OpenAQClient:
    """Dependency provider for OpenAQ client."""
    return openaq_client


def _severity_color(frp: float) -> str:
    """Map FRP to display color for map hotspots."""
    if frp > 100:
        return "#FF0000"
    if frp >= 50:
        return "#FF6600"
    return "#FFAA00"


def _event_to_geojson_feature(event: FireEvent) -> dict[str, Any]:
    """Convert FireEvent to GeoJSON feature for map clients."""
    timestamp = f"{event.acq_date}T{event.acq_time.zfill(4)[:2]}:{event.acq_time.zfill(4)[2:]}:00Z"
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [event.longitude, event.latitude],
        },
        "properties": {
            "confidence": event.confidence,
            "frp": event.frp,
            "timestamp": timestamp,
            "brightness": event.brightness,
            "severity_color": _severity_color(event.frp),
        },
    }


def _to_feature_collection(events: list[FireEvent]) -> dict[str, Any]:
    """Build GeoJSON FeatureCollection."""
    return {
        "type": "FeatureCollection",
        "features": [_event_to_geojson_feature(event) for event in events],
    }


@router.get("/india", response_model=dict[str, Any])
async def get_active_fires_india(
    days: int = Query(default=1, ge=1, le=10),
    client: FIRMSClient = Depends(get_firms_client),
) -> dict[str, Any]:
    """Return all active India fires as GeoJSON FeatureCollection."""
    try:
        fires = await client.get_active_fires_india(days=days)
        return _to_feature_collection(fires)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch India fires: {exc}") from exc


@router.get("/near", response_model=dict[str, Any])
async def get_fires_near(
    lat: float = Query(..., description="Latitude of query center."),
    lon: float = Query(..., description="Longitude of query center."),
    radius: int = Query(default=100, ge=1, le=500, description="Radius in kilometers."),
    days: int = Query(default=1, ge=1, le=10),
    client: FIRMSClient = Depends(get_firms_client),
) -> dict[str, Any]:
    """Return fires near a point as GeoJSON FeatureCollection."""
    try:
        fires = await client.get_fires_near(lat=lat, lon=lon, radius_km=radius, days=days)
        return _to_feature_collection(fires)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch nearby fires: {exc}") from exc


@router.get("/summary", response_model=FireSummary)
async def get_fire_summary(
    client: FIRMSClient = Depends(get_firms_client),
) -> FireSummary:
    """Return FIRMS fire summary metrics."""
    try:
        return FireSummary(**(await client.get_fire_summary()))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch fire summary: {exc}") from exc


@router.get("/impact-on-air", response_model=list[dict[str, Any]])
async def get_fire_impact_on_air(
    firms: FIRMSClient = Depends(get_firms_client),
    openaq: OpenAQClient = Depends(get_openaq_client),
) -> list[dict[str, Any]]:
    """Correlate high-confidence fires with nearby PM2.5 degradation."""
    try:
        fire_events = await firms.get_active_fires_india(days=1)
        high_conf_fires = [event for event in fire_events if event.confidence == "high"]
        if not high_conf_fires:
            return []

        # Keep calls bounded while preserving representative nationwide coverage.
        sampled_fires = sorted(high_conf_fires, key=lambda item: item.frp, reverse=True)[:25]
        station_ids: set[int] = set()
        for fire in sampled_fires:
            stations = await openaq.get_nearest_stations(
                lat=fire.latitude, lon=fire.longitude, radius_km=100
            )
            for station in stations:
                station_id = station.get("id")
                if station_id is not None:
                    station_ids.add(int(station_id))

        if not station_ids:
            return []

        air_readings: list[AirQualityReading] = await openaq.get_latest_readings(
            station_ids=list(station_ids)
        )
        return firms.correlate_fire_to_air_quality(
            fire_events=high_conf_fires, air_readings=air_readings
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to correlate fire impact on air: {exc}"
        ) from exc
