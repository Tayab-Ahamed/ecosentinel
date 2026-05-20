"""NASA FIRMS async API client."""

import asyncio
import logging
import os
from io import StringIO
from math import asin, cos, radians, sin, sqrt
from time import time
from typing import Any

import httpx
import pandas as pd
from dotenv import load_dotenv

from models.schemas import AirQualityReading, FireEvent

load_dotenv()

logger = logging.getLogger(__name__)


class FIRMSClient:
    """Client wrapper for NASA FIRMS fire data in CSV format."""

    BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
    INDIA_BBOX = "68.0,8.0,97.0,37.0"
    CACHE_TTL_SECONDS = 1800  # 30 minutes
    BENGALURU_COORDS = (12.9716, 77.5946)

    _STATE_CENTROIDS: dict[str, tuple[float, float]] = {
        "Karnataka": (15.3173, 75.7139),
        "Maharashtra": (19.7515, 75.7139),
        "Tamil Nadu": (11.1271, 78.6569),
        "Kerala": (10.8505, 76.2711),
        "Telangana": (18.1124, 79.0193),
        "Andhra Pradesh": (15.9129, 79.7400),
        "Gujarat": (22.2587, 71.1924),
        "Rajasthan": (27.0238, 74.2179),
        "Madhya Pradesh": (22.9734, 78.6569),
        "Uttar Pradesh": (26.8467, 80.9462),
        "West Bengal": (22.9868, 87.8550),
        "Odisha": (20.9517, 85.0985),
        "Bihar": (25.0961, 85.3131),
        "Assam": (26.2006, 92.9376),
        "Punjab": (31.1471, 75.3412),
        "Haryana": (29.0588, 76.0856),
        "Delhi": (28.7041, 77.1025),
    }

    def __init__(self) -> None:
        self.api_key: str = os.getenv("FIRMS_API_KEY", "")
        self._cache: dict[str, tuple[float, list[FireEvent]]] = {}
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(30.0))

    async def close(self) -> None:
        """Close underlying HTTP resources."""
        await self._client.aclose()

    @staticmethod
    def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Compute haversine distance in kilometers."""
        earth_radius_km = 6371.0
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
        return 2 * earth_radius_km * asin(sqrt(a))

    @classmethod
    def _nearest_state(cls, lat: float, lon: float) -> str:
        """Approximate state using nearest centroid."""
        nearest_name = "Unknown"
        nearest_distance = float("inf")
        for state_name, (state_lat, state_lon) in cls._STATE_CENTROIDS.items():
            dist = cls._distance_km(lat, lon, state_lat, state_lon)
            if dist < nearest_distance:
                nearest_distance = dist
                nearest_name = state_name
        return nearest_name

    async def _fetch_area_csv(self, area: str, days: int) -> list[FireEvent]:
        """Fetch and parse FIRMS CSV with retries and caching."""
        cache_key = f"{area}:{days}"
        cached = self._cache.get(cache_key)
        if cached and (time() - cached[0]) < self.CACHE_TTL_SECONDS:
            return cached[1]

        if not self.api_key:
            logger.error("FIRMS_API_KEY is not configured.")
            return []

        url = f"{self.BASE_URL}/{self.api_key}/VIIRS_SNPP_NRT/{area}/{days}"
        for attempt in range(3):
            try:
                response = await self._client.get(url)
                response.raise_for_status()
                csv_text = response.text.strip()
                if not csv_text:
                    return []

                frame = pd.read_csv(StringIO(csv_text))
                events = self._frame_to_events(frame)
                self._cache[cache_key] = (time(), events)
                return events
            except Exception as exc:  # noqa: BLE001
                logger.error("FIRMS API request failed (attempt %s): %s", attempt + 1, exc)
                if attempt < 2:
                    await asyncio.sleep(2**attempt)
        return []

    def _frame_to_events(self, frame: pd.DataFrame) -> list[FireEvent]:
        """Convert pandas rows to FireEvent objects."""
        events: list[FireEvent] = []
        for _, row in frame.iterrows():
            try:
                confidence = str(row.get("confidence", "low")).strip().lower()
                if confidence not in {"low", "nominal", "high"}:
                    confidence = "low"
                events.append(
                    FireEvent(
                        latitude=float(row.get("latitude", 0.0)),
                        longitude=float(row.get("longitude", 0.0)),
                        brightness=float(row.get("bright_ti4", 0.0)),
                        scan=float(row.get("scan", 0.0)),
                        track=float(row.get("track", 0.0)),
                        acq_date=str(row.get("acq_date", "")),
                        acq_time=str(row.get("acq_time", "")),
                        confidence=confidence,
                        frp=float(row.get("frp", 0.0)),
                    )
                )
            except Exception as exc:  # noqa: BLE001
                logger.error("Failed parsing FIRMS row: %s", exc)
        return events

    async def get_active_fires_india(self, days: int = 1) -> list[FireEvent]:
        """Fetch active fires in India for the last N days."""
        return await self._fetch_area_csv(area=self.INDIA_BBOX, days=days)

    async def get_fires_near(
        self,
        lat: float,
        lon: float,
        radius_km: int = 100,
        days: int = 1,
    ) -> list[FireEvent]:
        """Return fires near a point within radius."""
        events = await self.get_active_fires_india(days=days)
        return [
            event
            for event in events
            if self._distance_km(lat, lon, event.latitude, event.longitude) <= float(radius_km)
        ]

    async def get_fire_summary(self) -> dict[str, Any]:
        """Return high-level summary for India fire activity."""
        events = await self.get_active_fires_india(days=1)
        if not events:
            return {
                "total_count": 0,
                "high_confidence_count": 0,
                "states_affected": [],
                "nearest_fire_to_bengaluru": {},
            }

        high_conf_events = [event for event in events if event.confidence == "high"]
        states_affected = sorted(
            {self._nearest_state(event.latitude, event.longitude) for event in high_conf_events}
        )

        nearest_fire: FireEvent | None = None
        nearest_distance = float("inf")
        for event in events:
            distance = self._distance_km(
                self.BENGALURU_COORDS[0],
                self.BENGALURU_COORDS[1],
                event.latitude,
                event.longitude,
            )
            if distance < nearest_distance:
                nearest_distance = distance
                nearest_fire = event

        nearest_fire_to_bengaluru: dict[str, Any] = {}
        if nearest_fire:
            nearest_fire_to_bengaluru = {
                "distance_km": round(nearest_distance, 2),
                "fire": nearest_fire.model_dump(),
            }

        return {
            "total_count": len(events),
            "high_confidence_count": len(high_conf_events),
            "states_affected": states_affected,
            "nearest_fire_to_bengaluru": nearest_fire_to_bengaluru,
        }

    def correlate_fire_to_air_quality(
        self,
        fire_events: list[FireEvent],
        air_readings: list[AirQualityReading],
    ) -> list[dict[str, Any]]:
        """Correlate high-confidence fires to elevated nearby PM2.5 stations."""
        correlations: list[dict[str, Any]] = []
        high_conf_fires = [event for event in fire_events if event.confidence == "high"]
        for fire in high_conf_fires:
            nearby = [
                reading
                for reading in air_readings
                if reading.parameter.value == "pm25"
                and self._distance_km(
                    fire.latitude,
                    fire.longitude,
                    reading.location.lat,
                    reading.location.lon,
                )
                <= 150.0
            ]
            if not nearby:
                continue

            avg_pm25 = sum(reading.value for reading in nearby) / len(nearby)
            correlations.append(
                {
                    "fire_event": fire.model_dump(),
                    "nearby_station_count": len(nearby),
                    "average_pm25": round(avg_pm25, 2),
                    "elevated_pm25": avg_pm25 >= 35.0,
                    "heuristic": "distance<=150km and avg_pm25>=35 indicates likely smoke impact",
                }
            )
        return correlations
