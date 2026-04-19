"""Smoke tests for critical API surface."""

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
