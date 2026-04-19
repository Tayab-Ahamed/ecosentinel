"""FastAPI application entry point for EcoSentinel."""

import asyncio
import logging
import os
from datetime import UTC, datetime
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers.air_quality import openaq_client, router as air_quality_router
from routers.fire_data import firms_client, router as fire_data_router
from routers.prediction import prophet_service, router as prediction_router
from routers.voice_agent import whisper_client, router as voice_agent_router
from routers.waste_vision import gemini_client, router as waste_vision_router
from services.prophet_model import ProphetModelService

load_dotenv()

logger = logging.getLogger(__name__)


def _is_production() -> bool:
    """True when errors should not expose internal exception text to clients."""
    return os.getenv("ECOSENTINEL_ENV", "").strip().lower() in ("production", "prod")


DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://ecosentinel.vercel.app",
]


def _allowed_origins() -> list[str]:
    """Return explicit origins plus any optional deployed frontend URL."""
    origins = list(DEFAULT_ALLOWED_ORIGINS)
    extra_origin = os.getenv("FRONTEND_URL", "").strip()
    if extra_origin:
        origins.append(extra_origin)
    return sorted(set(origins))


def _build_alerts(air_readings: list[dict[str, Any]], fires: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Create lightweight alert payloads for the realtime WebSocket feed."""
    alerts: list[dict[str, Any]] = []
    for reading in air_readings:
        value = float(reading.get("value", 0.0))
        location = reading.get("location", {})
        if value > 300:
            alerts.append(
                {
                    "type": "alert",
                    "severity": "critical",
                    "title": "Hazardous PM2.5 spike",
                    "message": f"PM2.5 near {location.get('city', 'your area')} is {value:.1f} ug/m3.",
                    "source": "air_quality",
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            )

    for fire in fires:
        distance_km = float(fire.get("distance_km", 9999.0))
        if distance_km <= 50:
            alerts.append(
                {
                    "type": "alert",
                    "severity": "warning",
                    "title": "Nearby fire activity detected",
                    "message": f"An active fire event is {distance_km:.1f} km away from Bengaluru.",
                    "source": "fire",
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            )
    return alerts

OPENAPI_TAGS: list[dict[str, str]] = [
    {
        "name": "air-quality",
        "description": "Endpoints for real-time and latest city-level air quality insights.",
    },
    {
        "name": "fire-data",
        "description": "Endpoints for active wildfire intelligence and regional fire activity.",
    },
    {
        "name": "waste-vision",
        "description": "Endpoints for AI-powered waste image classification and disposal guidance.",
    },
    {
        "name": "voice-agent",
        "description": "Endpoints for voice-based eco assistant interactions and Q&A.",
    },
    {
        "name": "prediction",
        "description": "Endpoints for short-term environmental forecasting and trend prediction.",
    },
    {
        "name": "system",
        "description": "System health and platform lifecycle endpoints.",
    },
    {
        "name": "live-feed",
        "description": "WebSocket stream for continuously updated environmental telemetry.",
    },
]

app: FastAPI = FastAPI(
    title="EcoSentinel API",
    description="Environmental intelligence APIs for air, fire, waste, voice, and forecasting.",
    version="0.1.0",
    openapi_tags=OPENAPI_TAGS,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(air_quality_router, prefix="/api")
app.include_router(fire_data_router, prefix="/api")
app.include_router(waste_vision_router, prefix="/api")
app.include_router(voice_agent_router, prefix="/api")
app.include_router(prediction_router, prefix="/api")


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Any, exc: HTTPException) -> JSONResponse:
    """Return consistent JSON error payload for HTTP exceptions."""
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Any, exc: Exception) -> JSONResponse:
    """Return a generic 500 response for unexpected failures."""
    logger.exception("Unhandled exception")
    if _is_production():
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
    return JSONResponse(status_code=500, content={"detail": f"Internal server error: {exc}"})


@app.on_event("startup")
async def startup_event() -> None:
    """Initialize all service clients and expose startup readiness state."""
    try:
        # Re-load env and warm client config fields at startup.
        load_dotenv(override=False)
        openaq_client.api_key = os.getenv("OPENAQ_API_KEY", "")
        firms_client.api_key = os.getenv("FIRMS_API_KEY", "")
        gemini_client.api_key = os.getenv("GEMINI_API_KEY", "")
        skip_whisper = os.getenv("ECOSENTINEL_SKIP_WHISPER_INIT", "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        whisper_ready = False if skip_whisper else await whisper_client.initialize_model()

        app.state.clients_ready = {
            "openaq": bool(openaq_client.api_key),
            "firms": bool(firms_client.api_key),
            "gemini": bool(gemini_client.api_key),
            "whisper": whisper_ready,
            "prophet": ProphetModelService.is_prophet_available(),
        }
        app.state.started_at = datetime.now(UTC).isoformat()
    except Exception as exc:
        logger.exception("Startup initialization failed")
        raise RuntimeError("Startup initialization failed") from exc


@app.on_event("shutdown")
async def shutdown_event() -> None:
    """Close shared HTTP clients cleanly."""
    await asyncio.gather(
        openaq_client.close(),
        firms_client.close(),
        gemini_client.openaq_client.close(),
        return_exceptions=True,
    )


@app.get("/health", tags=["system"])
async def health_check() -> dict[str, Any]:
    """Return service health and client readiness status."""
    try:
        return {
            "status": "ok",
            "timestamp": datetime.now(UTC).isoformat(),
            "clients_ready": getattr(app.state, "clients_ready", {}),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Health check failed: {exc}") from exc


@app.websocket("/ws/live-feed")
async def websocket_live_feed(websocket: WebSocket) -> None:
    """Stream air quality, fire, and alert updates every 30 seconds."""
    await websocket.accept()
    feed_city: str = os.getenv("LIVE_FEED_CITY", "Bengaluru")
    feed_lat: float = float(os.getenv("LIVE_FEED_LAT", "12.9716"))
    feed_lon: float = float(os.getenv("LIVE_FEED_LON", "77.5946"))

    try:
        while True:
            stations = await openaq_client.get_nearest_stations(lat=feed_lat, lon=feed_lon)
            station_ids = [int(station["id"]) for station in stations if "id" in station][:5]
            air_quality = await openaq_client.get_latest_readings(station_ids=station_ids) if station_ids else []
            nearby_fires = await firms_client.get_fires_near(lat=feed_lat, lon=feed_lon, radius_km=250, days=1)

            fire_payload = [
                {
                    **fire.model_dump(),
                    "distance_km": round(
                        firms_client._distance_km(feed_lat, feed_lon, fire.latitude, fire.longitude), 2
                    ),
                }
                for fire in nearby_fires
            ]
            await websocket.send_json(
                {
                    "type": "air_quality",
                    "city": feed_city,
                    "timestamp": datetime.now(UTC).isoformat(),
                    "readings": [reading.model_dump(mode="json") for reading in air_quality],
                }
            )
            await websocket.send_json(
                {
                    "type": "fire",
                    "city": feed_city,
                    "timestamp": datetime.now(UTC).isoformat(),
                    "events": fire_payload,
                }
            )
            for alert in _build_alerts(
                air_readings=[reading.model_dump(mode="json") for reading in air_quality],
                fires=fire_payload,
            ):
                await websocket.send_json(alert)
            await asyncio.sleep(30)
    except WebSocketDisconnect:
        return
    except HTTPException as exc:
        await websocket.send_json({"error": exc.detail})
        await websocket.close(code=1011)
    except Exception as exc:
        await websocket.send_json({"error": f"Live feed error: {exc}"})
        await websocket.close(code=1011)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
