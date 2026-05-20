"""Historical data router — cache OpenAQ readings in PostgreSQL/SQLite."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models.db import HistoricalData
from routers.air_quality import openaq_client

router = APIRouter(prefix="/historical", tags=["historical"])


class HistoricalCacheRequest(BaseModel):
    """Payload for storing a single cached measurement."""

    location_city: str
    location_lat: float
    location_lon: float
    parameter: str = "pm25"
    value: float
    unit: str = "µg/m³"
    timestamp: datetime
    source: str = "openaq"


def _parse_openaq_timestamp(item: dict) -> datetime | None:
    """Extract UTC timestamp from an OpenAQ measurement object."""
    dt = item.get("datetime") or item.get("date") or {}
    ts_value = dt.get("utc") if isinstance(dt, dict) else dt
    if not ts_value:
        return None
    text = str(ts_value).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except ValueError:
        return None


@router.get("/readings")
async def get_historical_readings(
    city: str = Query(..., description="City name (case-insensitive match)."),
    parameter: str = Query("pm25"),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(500, ge=1, le=2000),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return cached historical readings for a city and pollutant."""
    since = datetime.now(UTC) - timedelta(days=days)
    city_key = city.strip().lower()
    stmt = (
        select(HistoricalData)
        .where(func.lower(HistoricalData.location_city) == city_key)
        .where(HistoricalData.parameter == parameter.lower())
        .where(HistoricalData.timestamp >= since)
        .order_by(HistoricalData.timestamp.asc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return {
        "city": city,
        "parameter": parameter.lower(),
        "count": len(rows),
        "readings": [
            {
                "timestamp": row.timestamp.isoformat(),
                "value": row.value,
                "unit": row.unit,
                "parameter": row.parameter,
                "location_city": row.location_city,
                "location_lat": row.location_lat,
                "location_lon": row.location_lon,
                "source": row.source,
            }
            for row in rows
        ],
    }


@router.post("/cache")
async def cache_reading(
    reading: HistoricalCacheRequest,
    session: AsyncSession = Depends(get_session),
) -> HistoricalData:
    """Persist one air-quality reading in the local cache."""
    row = HistoricalData(
        location_city=reading.location_city.strip().lower(),
        location_lat=reading.location_lat,
        location_lon=reading.location_lon,
        parameter=reading.parameter.lower(),
        value=reading.value,
        unit=reading.unit,
        timestamp=reading.timestamp,
        source=reading.source,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.post("/sync")
async def sync_from_openaq(
    station_id: int = Query(..., ge=1),
    city: str = Query(...),
    lat: float = Query(...),
    lon: float = Query(...),
    parameter: str = Query("pm25"),
    days: int = Query(7, ge=1, le=90),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Pull recent OpenAQ measurements and store them in the local cache."""
    try:
        raw = await openaq_client.get_historical_data(
            station_id=station_id,
            parameter=parameter,
            days=days,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenAQ sync failed: {exc}") from exc

    city_key = city.strip().lower()
    synced = 0
    for item in raw:
        ts = _parse_openaq_timestamp(item)
        if ts is None:
            continue
        session.add(
            HistoricalData(
                location_city=city_key,
                location_lat=lat,
                location_lon=lon,
                parameter=parameter.lower(),
                value=float(item.get("value", 0.0)),
                unit=str(item.get("unit", "µg/m³")),
                timestamp=ts,
                source="openaq",
            )
        )
        synced += 1

    await session.commit()
    return {
        "synced": synced,
        "station_id": station_id,
        "city": city_key,
        "parameter": parameter.lower(),
    }
