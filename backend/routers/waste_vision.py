"""Waste vision and community hotspot routes."""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, HttpUrl

from models.schemas import WasteClassification, WasteType
from services.gemini_client import GeminiClient

router: APIRouter = APIRouter(prefix="/waste", tags=["waste-vision"])
gemini_client: GeminiClient = GeminiClient()

MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
ALLOWED_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class WasteUrlRequest(BaseModel):
    """Request payload for URL-based waste classification."""

    image_url: HttpUrl
    lat: float
    lon: float


class WasteHotspotReportRequest(BaseModel):
    """Community-reported waste hotspot payload."""

    lat: float
    lon: float
    waste_type: WasteType
    severity: int = Field(ge=1, le=5)
    image_url: HttpUrl | None = None


class WasteHotspotRecord(BaseModel):
    """Stored hotspot record."""

    id: int
    lat: float
    lon: float
    waste_type: WasteType
    severity: int = Field(ge=1, le=5)
    image_url: str | None = None
    reported_at: datetime


_waste_hotspots: list[WasteHotspotRecord] = []


def _validate_uploaded_image(image: UploadFile, image_bytes: bytes) -> None:
    """Validate MIME, extension, and max size of uploaded image."""
    filename = (image.filename or "").lower()
    if not any(filename.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Invalid file extension. Use jpg/png/webp.")
    if image.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid content type. Use image/jpeg, image/png, or image/webp.",
        )
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 10MB size limit.")


@router.post("/classify-image", response_model=WasteClassification)
async def classify_waste_image(
    image: UploadFile = File(...),
    lat: float = Form(...),
    lon: float = Form(...),
) -> WasteClassification:
    """Classify uploaded waste image from multipart form-data."""
    image_bytes: bytes = await image.read()
    _validate_uploaded_image(image=image, image_bytes=image_bytes)
    return await gemini_client.classify_waste(
        image_bytes=image_bytes, location={"lat": lat, "lon": lon}
    )


@router.post("/classify-url", response_model=WasteClassification)
async def classify_waste_url(payload: WasteUrlRequest) -> WasteClassification:
    """Classify waste from image URL."""
    return await gemini_client.analyze_waste_from_url(
        image_url=str(payload.image_url), location={"lat": payload.lat, "lon": payload.lon}
    )


@router.get("/impact-stats", response_model=dict[str, dict[str, str | int]])
async def get_waste_impact_stats() -> dict[str, dict[str, str | int]]:
    """Return educational decomposition and air impact stats."""
    return {
        "plastic": {"decompose_years": 450, "air_impact": "high"},
        "paper": {"decompose_years": 2, "air_impact": "low"},
        "glass": {"decompose_years": 1000000, "air_impact": "moderate"},
        "metal": {"decompose_years": 200, "air_impact": "moderate"},
        "ewaste": {"decompose_years": 1000, "air_impact": "severe"},
        "medical": {"decompose_years": 50, "air_impact": "severe"},
        "construction": {"decompose_years": 100, "air_impact": "moderate"},
        "organic": {"decompose_years": 1, "air_impact": "low"},
        "hazardous": {"decompose_years": 500, "air_impact": "severe"},
        "mixed": {"decompose_years": 300, "air_impact": "high"},
    }


@router.post("/report-hotspot", response_model=WasteHotspotRecord)
async def report_waste_hotspot(payload: WasteHotspotReportRequest) -> WasteHotspotRecord:
    """Store a user-reported waste hotspot in memory."""
    record = WasteHotspotRecord(
        id=len(_waste_hotspots) + 1,
        lat=payload.lat,
        lon=payload.lon,
        waste_type=payload.waste_type,
        severity=payload.severity,
        image_url=str(payload.image_url) if payload.image_url else None,
        reported_at=datetime.now(UTC),
    )
    _waste_hotspots.append(record)
    return record


@router.get("/hotspots", response_model=dict[str, Any])
async def get_waste_hotspots() -> dict[str, Any]:
    """Return all reported hotspots as GeoJSON FeatureCollection."""
    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [record.lon, record.lat]},
            "properties": {
                "id": record.id,
                "waste_type": record.waste_type.value,
                "severity": record.severity,
                "image_url": record.image_url,
                "reported_at": record.reported_at.isoformat(),
            },
        }
        for record in _waste_hotspots
    ]
    return {"type": "FeatureCollection", "features": features}
