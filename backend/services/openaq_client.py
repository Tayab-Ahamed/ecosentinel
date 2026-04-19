"""OpenAQ v3 async service client."""

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from dotenv import load_dotenv

from models.schemas import AirQualityReading, AirParameter, Location

load_dotenv()

logger = logging.getLogger(__name__)


class OpenAQClient:
    """Async client wrapper for OpenAQ v3 integrations."""

    BASE_URL = "https://api.openaq.org/v3"
    CACHE_TTL_SECONDS = 300

    def __init__(self) -> None:
        self.api_key: str = os.getenv("OPENAQ_API_KEY", "")
        self._timeout = httpx.Timeout(20.0)
        self._cache: dict[str, tuple[datetime, Any]] = {}
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        self._client = httpx.AsyncClient(base_url=self.BASE_URL, timeout=self._timeout, headers=headers)

    async def close(self) -> None:
        """Close underlying HTTP resources."""
        await self._client.aclose()

    async def _get_json(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
        """GET JSON with retry and backoff."""
        cache_key = f"{path}|{params or {}}"
        cached = self._cache.get(cache_key)
        now = datetime.now(UTC)
        if cached and cached[0] > now:
            return cached[1]

        for attempt in range(3):
            try:
                response = await self._client.get(path, params=params)
                response.raise_for_status()
                data = response.json()
                self._cache[cache_key] = (now + timedelta(seconds=self.CACHE_TTL_SECONDS), data)
                return data
            except Exception as exc:  # noqa: BLE001
                logger.error("OpenAQ request failed (%s %s): %s", path, params, exc)
                if attempt < 2:
                    await asyncio.sleep(2**attempt)
        return None

    @staticmethod
    def _normalize_parameter(parameter: str) -> AirParameter | None:
        """Map raw OpenAQ parameter to supported enum values."""
        normalized = parameter.lower()
        if normalized in {"pm25", "pm2.5"}:
            return AirParameter.PM25
        if normalized in {"co2"}:
            return AirParameter.CO2
        if normalized in {"no2"}:
            return AirParameter.NO2
        return None

    async def get_nearest_stations(self, lat: float, lon: float, radius_km: int = 25) -> list[dict[str, Any]]:
        """Return nearest locations around coordinates."""
        data = await self._get_json(
            "/locations",
            params={
                "coordinates": f"{lat},{lon}",
                "radius": radius_km * 1000,
                "limit": 10,
            },
        )
        if not data:
            return []
        return data.get("results", [])

    async def get_latest_readings(self, station_ids: list[int]) -> list[AirQualityReading]:
        """Fetch latest PM2.5 readings for multiple station IDs."""
        readings: list[AirQualityReading] = []
        for station_id in station_ids:
            data = await self._get_json(
                "/measurements",
                params={"location_id": station_id, "parameter": "pm25", "limit": 100},
            )
            if not data:
                continue
            for item in data.get("results", []):
                parameter = self._normalize_parameter(str(item.get("parameter", "pm25")))
                if parameter is None:
                    continue
                location = item.get("coordinates") or {}
                city = item.get("city") or item.get("location") or "Unknown"
                timestamp = item.get("datetime") or item.get("date") or {}
                ts_value = timestamp.get("utc") if isinstance(timestamp, dict) else timestamp
                try:
                    reading = AirQualityReading(
                        station_id=station_id,
                        location=Location(
                            lat=float(location.get("latitude", 0.0)),
                            lon=float(location.get("longitude", 0.0)),
                            city=str(city),
                        ),
                        parameter=parameter,
                        value=float(item.get("value", 0.0)),
                        unit=str(item.get("unit", "ug/m3")),
                        timestamp=datetime.fromisoformat(str(ts_value).replace("Z", "+00:00")),
                    )
                    readings.append(reading)
                except Exception as exc:  # noqa: BLE001
                    logger.error("Failed to parse air reading for station %s: %s", station_id, exc)
        return readings

    async def get_historical_data(
        self,
        station_id: int,
        parameter: str,
        days: int = 30,
    ) -> list[dict[str, Any]]:
        """Fetch historical measurements for one station and pollutant."""
        date_from = (datetime.now(UTC) - timedelta(days=days)).date().isoformat()
        data = await self._get_json(
            "/measurements",
            params={
                "location_id": station_id,
                "parameter": parameter.lower(),
                "limit": 100,
                "date_from": date_from,
            },
        )
        if not data:
            return []
        return data.get("results", [])

    async def get_city_average(self, city_name: str) -> dict[str, float]:
        """Return pollutant averages for a city (pm25, co2, no2)."""
        location_data = await self._get_json("/locations", params={"city": city_name, "limit": 25})
        if not location_data:
            return {"pm25": 0.0, "co2": 0.0, "no2": 0.0}

        station_ids = [int(loc["id"]) for loc in location_data.get("results", []) if "id" in loc]
        if not station_ids:
            return {"pm25": 0.0, "co2": 0.0, "no2": 0.0}

        sums = {"pm25": 0.0, "co2": 0.0, "no2": 0.0}
        counts = {"pm25": 0, "co2": 0, "no2": 0}

        for station_id in station_ids:
            for parameter in ("pm25", "co2", "no2"):
                data = await self._get_json(
                    "/measurements",
                    params={"location_id": station_id, "parameter": parameter, "limit": 100},
                )
                if not data:
                    continue
                values = [float(item.get("value", 0.0)) for item in data.get("results", []) if item.get("value") is not None]
                if not values:
                    continue
                sums[parameter] += sum(values)
                counts[parameter] += len(values)

        return {
            key: (sums[key] / counts[key]) if counts[key] else 0.0
            for key in ("pm25", "co2", "no2")
        }

    async def get_india_hotspots(self) -> list[dict[str, Any]]:
        """Return top 10 Indian locations with highest current PM2.5."""
        locations_data = await self._get_json("/locations", params={"country": "IN", "limit": 100})
        if not locations_data:
            return []

        locations = locations_data.get("results", [])
        hotspots: list[dict[str, Any]] = []
        for location in locations:
            location_id = location.get("id")
            if location_id is None:
                continue
            readings = await self._get_json(
                "/measurements",
                params={"location_id": int(location_id), "parameter": "pm25", "limit": 1},
            )
            if not readings or not readings.get("results"):
                continue
            latest = readings["results"][0]
            hotspots.append(
                {
                    "location_id": int(location_id),
                    "location_name": location.get("name") or location.get("locality") or "Unknown",
                    "city": location.get("city") or "Unknown",
                    "pm25": float(latest.get("value", 0.0)),
                    "unit": latest.get("unit", "ug/m3"),
                    "timestamp": latest.get("datetime"),
                }
            )

        hotspots.sort(key=lambda item: item["pm25"], reverse=True)
        return hotspots[:10]

    async def get_latest(self, city: str) -> AirQualityReading | None:
        """Compatibility helper for existing router endpoint."""
        stations = await self._get_json("/locations", params={"city": city, "limit": 1})
        if not stations or not stations.get("results"):
            return None

        station_id = int(stations["results"][0]["id"])
        readings = await self.get_latest_readings(station_ids=[station_id])
        return readings[0] if readings else None
