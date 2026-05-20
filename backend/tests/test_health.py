"""API smoke and integration tests."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from main import app


def test_health_returns_ok() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "clients_ready" in body
    assert "timestamp" in body


def test_openapi_docs_available() -> None:
    with TestClient(app) as client:
        response = client.get("/docs")
    assert response.status_code == 200


def test_dashboard_stats_endpoint() -> None:
    with TestClient(app) as client:
        response = client.get(
            "/api/stats/dashboard",
            params={"lat": 12.9716, "lon": 77.5946},
        )
    assert response.status_code == 200
    body = response.json()
    assert "pm25" in body
    assert "city" in body
    assert "generated_at" in body


def test_historical_readings_empty_cache() -> None:
    with TestClient(app) as client:
        response = client.get(
            "/api/historical/readings",
            params={"city": "bengaluru", "parameter": "pm25", "days": 7},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["count"] >= 0
    assert "readings" in body


def test_historical_cache_roundtrip() -> None:
    payload = {
        "location_city": "bengaluru",
        "location_lat": 12.9716,
        "location_lon": 77.5946,
        "parameter": "pm25",
        "value": 42.5,
        "unit": "µg/m³",
        "timestamp": datetime.now(UTC).isoformat(),
        "source": "test",
    }
    with TestClient(app) as client:
        created = client.post("/api/historical/cache", json=payload)
        assert created.status_code == 200
        listed = client.get(
            "/api/historical/readings",
            params={"city": "Bengaluru", "parameter": "pm25", "days": 1},
        )
    assert listed.status_code == 200
    assert listed.json()["count"] >= 1
