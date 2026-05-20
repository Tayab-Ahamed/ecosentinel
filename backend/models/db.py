"""SQLModel table definitions for persistence."""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


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
