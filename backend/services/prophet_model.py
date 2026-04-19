"""Air quality forecasting service powered by Prophet."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import pandas as pd

try:
    from prophet import Prophet
except ModuleNotFoundError:  # pragma: no cover - depends on local install
    Prophet = None  # type: ignore[assignment]

from models.schemas import AirQualityForecast, ForecastPrediction
from services.openaq_client import OpenAQClient

logger = logging.getLogger(__name__)


class ProphetModelService:
    """Predict PM2.5 with Prophet and fall back to moving average."""

    CACHE_TTL_SECONDS = 3600

    def __init__(self) -> None:
        self.openaq_client = OpenAQClient()
        self._cache: dict[str, tuple[datetime, AirQualityForecast]] = {}

    @staticmethod
    def is_prophet_available() -> bool:
        """Return whether Prophet is installed in the current environment."""
        return Prophet is not None

    @staticmethod
    def get_aqi_risk_level(predicted_pm25: float) -> str:
        """Return user-friendly risk guidance based on PM2.5."""
        if predicted_pm25 <= 35:
            return "Safe to go out"
        if predicted_pm25 <= 75:
            return "Limit outdoor activity"
        if predicted_pm25 <= 150:
            return "Avoid outdoor activity"
        return "Stay indoors - hazardous"

    async def _fetch_pm25_history(self, station_id: int) -> list[dict[str, Any]]:
        """Fetch 30 days of PM2.5 history from OpenAQ client."""
        return await self.openaq_client.get_historical_data(station_id=station_id, parameter="pm25", days=30)

    @staticmethod
    def _to_dataframe(history: list[dict[str, Any]]) -> pd.DataFrame:
        """Convert OpenAQ historical data to Prophet dataframe."""
        rows: list[dict[str, Any]] = []
        for point in history:
            dt = point.get("datetime") or point.get("date") or {}
            timestamp = dt.get("utc") if isinstance(dt, dict) else dt
            if not timestamp:
                continue
            try:
                rows.append(
                    {
                        "ds": pd.to_datetime(str(timestamp), utc=True),
                        "y": float(point.get("value", 0.0)),
                    }
                )
            except Exception:  # noqa: BLE001
                continue
        if not rows:
            return pd.DataFrame(columns=["ds", "y"])
        frame = pd.DataFrame(rows).dropna()
        return frame.sort_values("ds").reset_index(drop=True)

    @staticmethod
    def _moving_average_forecast(frame: pd.DataFrame, hours_ahead: int) -> list[ForecastPrediction]:
        """Fallback forecast for sparse datasets (<7 days)."""
        if frame.empty:
            baseline = 0.0
            now = datetime.now(UTC)
        else:
            recent_window = frame["y"].tail(min(24, len(frame)))
            baseline = float(recent_window.mean())
            now = frame["ds"].max().to_pydatetime()
        lower = max(0.0, baseline * 0.85)
        upper = baseline * 1.15
        return [
            ForecastPrediction(
                timestamp=(now + timedelta(hours=i + 1)),
                pm25_predicted=baseline,
                confidence_interval_low=lower,
                confidence_interval_high=upper,
            )
            for i in range(hours_ahead)
        ]

    async def predict_air_quality(self, station_id: int, hours_ahead: int = 24) -> AirQualityForecast:
        """Predict next PM2.5 values in 1-hour intervals."""
        cache_key = f"{station_id}:{hours_ahead}"
        now = datetime.now(UTC)
        cached = self._cache.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]

        try:
            history = await self._fetch_pm25_history(station_id=station_id)
            frame = self._to_dataframe(history)
            if frame.empty:
                forecast = AirQualityForecast(
                    location=f"station_{station_id}",
                    predictions=[],
                    generated_at=now,
                )
                self._cache[cache_key] = (now + timedelta(seconds=self.CACHE_TTL_SECONDS), forecast)
                return forecast

            # If less than 7 days of hourly data, use moving average fallback.
            min_points_for_prophet = 24 * 7
            if len(frame) < min_points_for_prophet:
                predictions = self._moving_average_forecast(frame=frame, hours_ahead=hours_ahead)
                forecast = AirQualityForecast(
                    location=f"station_{station_id}",
                    predictions=predictions,
                    generated_at=now,
                )
                self._cache[cache_key] = (now + timedelta(seconds=self.CACHE_TTL_SECONDS), forecast)
                return forecast

            def _fit_and_predict() -> list[ForecastPrediction]:
                if Prophet is None:
                    raise ModuleNotFoundError("prophet is not installed")
                model = Prophet(
                    daily_seasonality=True,
                    weekly_seasonality=True,
                    changepoint_prior_scale=0.05,
                )
                model.add_country_holidays(country_name="IN")
                model.fit(frame)
                future = model.make_future_dataframe(periods=hours_ahead, freq="h", include_history=False)
                pred = model.predict(future)

                points: list[ForecastPrediction] = []
                for _, row in pred.iterrows():
                    points.append(
                        ForecastPrediction(
                            timestamp=pd.to_datetime(row["ds"], utc=True).to_pydatetime(),
                            pm25_predicted=max(0.0, float(row["yhat"])),
                            confidence_interval_low=max(0.0, float(row["yhat_lower"])),
                            confidence_interval_high=max(0.0, float(row["yhat_upper"])),
                        )
                    )
                return points

            try:
                predictions = await asyncio.to_thread(_fit_and_predict)
            except Exception as prophet_exc:  # noqa: BLE001
                logger.error("Prophet failed for station %s: %s", station_id, prophet_exc)
                predictions = self._moving_average_forecast(frame=frame, hours_ahead=hours_ahead)

            forecast = AirQualityForecast(
                location=f"station_{station_id}",
                predictions=predictions,
                generated_at=now,
            )
            self._cache[cache_key] = (now + timedelta(seconds=self.CACHE_TTL_SECONDS), forecast)
            return forecast
        except Exception as exc:  # noqa: BLE001
            logger.error("predict_air_quality failed for station %s: %s", station_id, exc)
            return AirQualityForecast(location=f"station_{station_id}", predictions=[], generated_at=now)
