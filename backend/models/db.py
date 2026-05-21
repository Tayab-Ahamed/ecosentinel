"""SQLModel table definitions for persistence."""

from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class WasteHotspot(SQLModel, table=True):
    """Community-reported waste hotspot and AI-verified cleanup record."""

    __tablename__ = "wastehotspot"

    id: Optional[int] = Field(default=None, primary_key=True)
    lat: float
    lon: float
    waste_type: str = Field(index=True)
    severity: int = Field(default=3)
    image_url: Optional[str] = Field(default=None)
    image_base64: Optional[str] = Field(default=None)
    reported_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    status: str = Field(default="active", index=True)  # "active" or "cleaned"
    cleaned_at: Optional[datetime] = Field(default=None)
    cleanup_image_base64: Optional[str] = Field(default=None)
    eco_points_awarded: int = Field(default=0)


class HistoricalData(SQLModel, table=True):
    """Cached air-quality measurement for offline charts and analytics."""

    __tablename__ = "historicaldata"

    id: Optional[int] = Field(default=None, primary_key=True)
    location_city: str = Field(index=True)
    location_lat: float
    location_lon: float
    parameter: str
    value: float
    unit: str
    timestamp: datetime = Field(index=True)
    source: str = "openaq"


class User(SQLModel, table=True):
    """User account (reserved for future authentication)."""

    __tablename__ = "user"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    is_active: bool = True
    is_superuser: bool = False
