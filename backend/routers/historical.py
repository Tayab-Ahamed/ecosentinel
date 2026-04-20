"""Historical data router with DB integration."""

from typing import List

from fastapi import APIRouter, Depends, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from backend.database import get_session
from backend.models.db import HistoricalData


router = APIRouter(prefix="/historical", tags=["historical"])


@router.get("/readings")
async def get_historical_readings(
    city: str = Query(...),
    parameter: str = "pm25",
    session: AsyncSession = Depends(get_session),
):
    """Fetch cached historical readings for city/parameter."""
    # Placeholder - implement query
    return {"city": city, "parameter": parameter, "count": 0}


@router.post("/cache")
async def cache_reading(
    reading: HistoricalData,
    session: AsyncSession = Depends(get_session),
):
    """Cache a new air quality reading."""
    session.add(reading)
    await session.commit()
    await session.refresh(reading)
    return reading
