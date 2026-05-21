"""Router for AI-powered personalized carbon reduction recommendations."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.gemini_client import GeminiClient

router: APIRouter = APIRouter(prefix="/carbon", tags=["carbon-advisor"])
gemini_client: GeminiClient = GeminiClient()
logger = logging.getLogger(__name__)


class CarbonAdvisorRequest(BaseModel):
    """Payload containing user footprint metrics for Gemini recommendations."""

    transport: str = Field(..., description="Daily transport mode (e.g. car_petrol, bus, ev)")
    transport_km: float = Field(..., ge=0, description="Daily commute distance in kilometers")
    food: str = Field(..., description="Diet type (e.g. meat_heavy, vegetarian, vegan)")
    energy_kwh: float = Field(
        ..., ge=0, description="Monthly household electricity consumption in kWh"
    )
    energy_source: str = Field(..., description="Electricity source (e.g. grid_india, solar)")


class CarbonRecommendationItem(BaseModel):
    """A single personalized carbon offset recommendation."""

    title: str
    description: str
    impact: str


class CarbonRecommendationsResponse(BaseModel):
    """Response containing a list of personalized carbon tips."""

    tips: list[CarbonRecommendationItem]


@router.post("/recommendations", response_model=CarbonRecommendationsResponse)
async def get_carbon_recommendations(payload: CarbonAdvisorRequest) -> dict[str, Any]:
    """Generate 3 highly personalized carbon offset recommendations using Gemini/fallback."""
    try:
        result = await gemini_client.get_carbon_recommendations(
            transport=payload.transport,
            transport_km=payload.transport_km,
            food=payload.food,
            energy_kwh=payload.energy_kwh,
            energy_source=payload.energy_source,
        )

        # Standardize structure if it doesn't match perfectly
        if not isinstance(result, dict) or "tips" not in result:
            logger.warning("Gemini did not return standard tips layout: %s", result)
            raise HTTPException(status_code=500, detail="Failed to parse carbon recommendations.")

        return result
    except Exception as exc:
        logger.exception("Carbon recommendations generation failed")
        raise HTTPException(
            status_code=500, detail=f"Carbon recommendations generation failed: {exc}"
        ) from exc
