"""API integration tests for Carbon Reduction Advisor endpoint."""

from fastapi.testclient import TestClient
from main import app


def test_carbon_recommendations_valid_payload() -> None:
    """Test generating carbon offset recommendations with a valid payload."""
    payload = {
        "transport": "car_petrol",
        "transport_km": 30.5,
        "food": "mixed",
        "energy_kwh": 220.0,
        "energy_source": "grid_india",
    }
    with TestClient(app) as client:
        response = client.post("/api/carbon/recommendations", json=payload)
    
    assert response.status_code == 200
    body = response.json()
    assert "tips" in body
    assert isinstance(body["tips"], list)
    assert len(body["tips"]) == 3
    
    for tip in body["tips"]:
        assert "title" in tip
        assert "description" in tip
        assert "impact" in tip
        assert isinstance(tip["title"], str)
        assert isinstance(tip["description"], str)
        assert isinstance(tip["impact"], str)


def test_carbon_recommendations_invalid_payload() -> None:
    """Test standard Pydantic schema validation failures for invalid inputs."""
    # Negative transport distance
    payload_negative_distance = {
        "transport": "bike",
        "transport_km": -10.0,
        "food": "vegan",
        "energy_kwh": 100.0,
        "energy_source": "solar",
    }
    with TestClient(app) as client:
        response = client.post("/api/carbon/recommendations", json=payload_negative_distance)
    assert response.status_code == 422

    # Missing mandatory transport_km field
    payload_missing_field = {
        "transport": "ev",
        "food": "vegetarian",
        "energy_kwh": 80.0,
        "energy_source": "solar",
    }
    with TestClient(app) as client:
        response = client.post("/api/carbon/recommendations", json=payload_missing_field)
    assert response.status_code == 422
