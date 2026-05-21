"""Unit and integration tests for waste hotspot tracking and gamification."""

import base64
from fastapi.testclient import TestClient

from main import app


def test_waste_flow_lifecycle() -> None:
    """Test the full lifecycle of a waste hotspot: report, retrieve, verify cleanup, and check stats/leaderboard."""
    dummy_image_b64 = "data:image/jpeg;base64," + base64.b64encode(b"dummy_before_image_bytes").decode("utf-8")
    
    with TestClient(app) as client:
        # 1. Report a new hotspot
        report_payload = {
            "lat": 12.9716,
            "lon": 77.5946,
            "waste_type": "plastic",
            "severity": 4,
            "image_base64": dummy_image_b64
        }
        report_response = client.post("/api/waste/report-hotspot", json=report_payload)
        assert report_response.status_code == 200, report_response.text
        report_data = report_response.json()
        assert report_data["id"] is not None
        assert report_data["status"] == "active"
        assert report_data["waste_type"] == "plastic"
        assert report_data["severity"] == 4
        assert report_data["image_base64"] == dummy_image_b64
        assert report_data["eco_points_awarded"] == 0
        
        hotspot_id = report_data["id"]

        # 2. Get list of hotspots (GeoJSON format)
        hotspots_response = client.get("/api/waste/hotspots")
        assert hotspots_response.status_code == 200
        hotspots_data = hotspots_response.json()
        assert hotspots_data["type"] == "FeatureCollection"
        features = hotspots_data["features"]
        assert len(features) >= 1
        
        # Find our reported hotspot in the collection
        our_feature = next((f for f in features if f["properties"]["id"] == hotspot_id), None)
        assert our_feature is not None
        assert our_feature["geometry"]["coordinates"] == [77.5946, 12.9716]
        assert our_feature["properties"]["status"] == "active"
        assert our_feature["properties"]["waste_type"] == "plastic"

        # 3. Verify waste count in dashboard stats
        stats_response = client.get("/api/stats/dashboard", params={"lat": 12.9716, "lon": 77.5946})
        assert stats_response.status_code == 200
        stats_data = stats_response.json()
        assert stats_data["waste_count"] >= 1

        # 4. Verify cleanup of the hotspot
        dummy_after_bytes = b"dummy_after_image_bytes"
        verify_response = client.post(
            f"/api/waste/verify-cleanup/{hotspot_id}",
            files={"image": ("after.jpg", dummy_after_bytes, "image/jpeg")}
        )
        assert verify_response.status_code == 200, verify_response.text
        verify_data = verify_response.json()
        assert verify_data["success"] is True
        assert "points_awarded" in verify_data
        assert verify_data["points_awarded"] == 4 * 50  # severity * 50

        # 5. Check hotspot status updated to cleaned
        hotspots_response_2 = client.get("/api/waste/hotspots")
        hotspots_data_2 = hotspots_response_2.json()
        our_feature_2 = next((f for f in hotspots_data_2["features"] if f["properties"]["id"] == hotspot_id), None)
        assert our_feature_2 is not None
        assert our_feature_2["properties"]["status"] == "cleaned"
        assert our_feature_2["properties"]["cleanup_image_base64"] is not None
        assert our_feature_2["properties"]["eco_points_awarded"] == 200

        # 6. Retrieve leaderboard and check score
        leaderboard_response = client.get("/api/waste/leaderboard")
        assert leaderboard_response.status_code == 200
        leaderboard_data = leaderboard_response.json()
        assert len(leaderboard_data) >= 1
        
        # User (Anonymous) should have the awarded points
        user_entry = next((item for item in leaderboard_data if "You (Anonymous)" in item["username"]), None)
        assert user_entry is not None
        assert user_entry["points"] >= 200
        assert user_entry["cleaned_count"] >= 1
