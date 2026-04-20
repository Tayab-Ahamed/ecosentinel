"""SQLModel for EcoSentinel data models."""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel
from backend.models.schemas import Location  # Reuse Pydantic where possible

from backend.database import SQLModel


class HistoricalData(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    location_city: str
    location_lat: float
    location_lon: float
    parameter: str
    value: float
    unit: str
    timestamp: datetime
    source: str = "openaq"


# Future: User model for auth
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    is_active: bool = True
    is_superuser: bool = False

