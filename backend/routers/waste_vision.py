"""Waste vision and community hotspot routes."""

import base64
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models.db import WasteHotspot
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
    image_base64: str | None = None


class WasteHotspotRecord(BaseModel):
    """Stored hotspot record."""

    id: int
    lat: float
    lon: float
    waste_type: WasteType
    severity: int = Field(ge=1, le=5)
    image_url: str | None = None
    image_base64: str | None = None
    reported_at: datetime
    status: str = "active"
    cleaned_at: datetime | None = None
    cleanup_image_base64: str | None = None
    eco_points_awarded: int = 0


class LeaderboardEntry(BaseModel):
    """Leaderboard ranking entry."""

    username: str
    points: int
    cleaned_count: int


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
async def report_waste_hotspot(
    payload: WasteHotspotReportRequest,
    session: AsyncSession = Depends(get_session),
) -> WasteHotspotRecord:
    """Store a user-reported waste hotspot in database."""
    record = WasteHotspot(
        lat=payload.lat,
        lon=payload.lon,
        waste_type=payload.waste_type.value,
        severity=payload.severity,
        image_url=str(payload.image_url) if payload.image_url else None,
        image_base64=payload.image_base64,
        status="active",
        eco_points_awarded=0,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)

    return WasteHotspotRecord(
        id=record.id,
        lat=record.lat,
        lon=record.lon,
        waste_type=WasteType(record.waste_type),
        severity=record.severity,
        image_url=record.image_url,
        image_base64=record.image_base64,
        reported_at=record.reported_at,
        status=record.status,
        cleaned_at=record.cleaned_at,
        cleanup_image_base64=record.cleanup_image_base64,
        eco_points_awarded=record.eco_points_awarded,
    )


@router.post("/verify-cleanup/{hotspot_id}")
async def verify_waste_cleanup(
    hotspot_id: int,
    image: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Verify that a reported hotspot has been cleaned using Gemini Vision before/after check."""
    stmt = select(WasteHotspot).where(WasteHotspot.id == hotspot_id)
    result = await session.execute(stmt)
    hotspot = result.scalars().first()
    if not hotspot:
        raise HTTPException(status_code=404, detail="Waste hotspot not found.")

    if hotspot.status == "cleaned":
        return {
            "success": False,
            "message": "This hotspot has already been cleaned and verified.",
            "points_awarded": hotspot.eco_points_awarded,
        }

    after_bytes = await image.read()
    _validate_uploaded_image(image=image, image_bytes=after_bytes)

    before_photo = hotspot.image_base64 or ""
    verification = await gemini_client.verify_cleanup(
        before_base64=before_photo, after_bytes=after_bytes
    )

    is_verified = verification.get("verified", False)
    confidence = verification.get("confidence", 0.0)
    feedback = verification.get("feedback", "No feedback provided.")

    if is_verified:
        encoded_cleanup = base64.b64encode(after_bytes).decode("utf-8")
        hotspot.status = "cleaned"
        hotspot.cleaned_at = datetime.now(UTC)
        hotspot.cleanup_image_base64 = f"data:image/jpeg;base64,{encoded_cleanup}"
        points = hotspot.severity * 50
        hotspot.eco_points_awarded = points

        session.add(hotspot)
        await session.commit()
        await session.refresh(hotspot)

        return {
            "success": True,
            "message": "Cleanup successfully verified by Gemini AI! Excellent work!",
            "points_awarded": points,
            "confidence": confidence,
            "feedback": feedback,
        }
    else:
        return {
            "success": False,
            "message": (
                "AI could not verify the cleanup. Please make sure the photo "
                "clearly shows the cleared site."
            ),
            "confidence": confidence,
            "feedback": feedback,
        }


@router.get("/hotspots", response_model=dict[str, Any])
async def get_waste_hotspots(
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Return all reported hotspots from database as GeoJSON FeatureCollection."""
    stmt = select(WasteHotspot).order_by(desc(WasteHotspot.reported_at))
    result = await session.execute(stmt)
    records = result.scalars().all()

    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [record.lon, record.lat]},
            "properties": {
                "id": record.id,
                "waste_type": record.waste_type,
                "severity": record.severity,
                "image_url": record.image_url,
                "image_base64": record.image_base64,
                "reported_at": record.reported_at.isoformat(),
                "status": record.status,
                "cleaned_at": record.cleaned_at.isoformat() if record.cleaned_at else None,
                "cleanup_image_base64": record.cleanup_image_base64,
                "eco_points_awarded": record.eco_points_awarded,
            },
        }
        for record in records
    ]
    return {"type": "FeatureCollection", "features": features}


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard(
    session: AsyncSession = Depends(get_session),
) -> list[LeaderboardEntry]:
    """Return community cleanup leaderboard standings."""
    stmt = select(func.sum(WasteHotspot.eco_points_awarded), func.count(WasteHotspot.id)).where(
        WasteHotspot.status == "cleaned"
    )
    result = await session.execute(stmt)
    row = result.first()

    total_db_points = 0
    db_cleaned_count = 0
    if row:
        total_db_points = row[0] or 0
        db_cleaned_count = row[1] or 0

    standing = [
        LeaderboardEntry(
            username="You (Anonymous)", points=total_db_points, cleaned_count=db_cleaned_count
        ),
        LeaderboardEntry(username="EcoWarrior99", points=450, cleaned_count=3),
        LeaderboardEntry(username="GreenBengaluru", points=350, cleaned_count=2),
        LeaderboardEntry(username="TrashBuster", points=200, cleaned_count=1),
        LeaderboardEntry(username="SustyCitizen", points=150, cleaned_count=1),
    ]

    standing.sort(key=lambda x: x.points, reverse=True)
    return standing
