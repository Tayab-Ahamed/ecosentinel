"""LangChain + Gemini environmental Q&A agent for EcoSentinel."""

import json
import logging
import os
from datetime import UTC, datetime
from typing import Any

import httpx
from dotenv import load_dotenv

try:
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
    from langchain_google_genai import ChatGoogleGenerativeAI
except ModuleNotFoundError:  # pragma: no cover - depends on local install
    AIMessage = HumanMessage = SystemMessage = None  # type: ignore[assignment]
    ChatGoogleGenerativeAI = None  # type: ignore[assignment]

from models.schemas import VoiceResponse

load_dotenv()

logger = logging.getLogger(__name__)


class EcoSentinelVoiceAgent:
    """Voice QA agent that answers with live environmental context."""

    def __init__(self) -> None:
        self.backend_base_url = os.getenv("ECOSENTINEL_BACKEND_URL", "http://localhost:8000")
        self.api_base = f"{self.backend_base_url.rstrip('/')}/api"
        self.model_name = "gemini-1.5-flash"
        self.google_api_key = os.getenv("GEMINI_API_KEY", "")
        self._llm: ChatGoogleGenerativeAI | None = None
        if self.google_api_key and ChatGoogleGenerativeAI is not None:
            try:
                self._llm = ChatGoogleGenerativeAI(
                    model=self.model_name,
                    google_api_key=self.google_api_key,
                    temperature=0.2,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Gemini LLM unavailable: %s", exc)
                self._llm = None

    @staticmethod
    def _needs_air_data(question: str) -> bool:
        keywords = ("air quality", "jog", "exercise", "breathe", "outdoor")
        lowered = question.lower()
        return any(word in lowered for word in keywords)

    @staticmethod
    def _needs_fire_data(question: str) -> bool:
        keywords = ("fire", "smoke", "burn", "haze")
        lowered = question.lower()
        return any(word in lowered for word in keywords)

    @staticmethod
    def _needs_waste_data(question: str) -> bool:
        keywords = ("waste", "trash", "garbage", "recycle")
        lowered = question.lower()
        return any(word in lowered for word in keywords)

    @staticmethod
    def _needs_forecast_data(question: str) -> bool:
        keywords = ("forecast", "tomorrow", "predict", "later")
        lowered = question.lower()
        return any(word in lowered for word in keywords)

    async def _fetch_json(
        self,
        client: httpx.AsyncClient,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        payload: dict[str, Any] | None = None,
    ) -> Any:
        """Fetch JSON from backend API with graceful fallback."""
        url = f"{self.api_base}{path}"
        try:
            if method == "GET":
                response = await client.get(url, params=params)
            else:
                response = await client.post(url, json=payload)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # noqa: BLE001
            logger.error("Live data fetch failed for %s %s: %s", method, path, exc)
            return {}

    async def _fetch_relevant_data(
        self, question: str, location: dict[str, Any]
    ) -> tuple[dict[str, Any], list[str]]:
        """Fetch live context based on question intent."""
        data_used: list[str] = []
        fetched_data: dict[str, Any] = {}
        lat = float(location.get("lat", 28.6139))
        lon = float(location.get("lon", 77.2090))
        city = str(location.get("city", "Unknown"))

        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
            if self._needs_air_data(question):
                air_near = await self._fetch_json(
                    client, "GET", "/air/nearest", params={"lat": lat, "lon": lon}
                )
                air_city = {}
                if city and city.lower() != "unknown":
                    air_city = await self._fetch_json(client, "GET", f"/air/city/{city}")
                fetched_data["air_quality"] = {"nearest": air_near, "city_average": air_city}
                data_used.extend(["air/nearest"] + (["air/city"] if air_city else []))

            if self._needs_fire_data(question):
                fires_near = await self._fetch_json(
                    client, "GET", "/fires/near", params={"lat": lat, "lon": lon, "radius": 150}
                )
                fire_summary = await self._fetch_json(client, "GET", "/fires/summary")
                fetched_data["fire_data"] = {"nearby_fires": fires_near, "summary": fire_summary}
                data_used.extend(["fires/near", "fires/summary"])

            if self._needs_waste_data(question):
                hotspots = await self._fetch_json(client, "GET", "/waste/hotspots")
                impact_stats = await self._fetch_json(client, "GET", "/waste/impact-stats")
                fetched_data["waste_data"] = {"hotspots": hotspots, "impact_stats": impact_stats}
                data_used.extend(["waste/hotspots", "waste/impact-stats"])

            if self._needs_forecast_data(question):
                current_air = await self._fetch_json(
                    client, "GET", "/air/nearest", params={"lat": lat, "lon": lon}
                )
                forecast = await self._fetch_json(
                    client,
                    "GET",
                    "/predict/air-quality",
                    params={"lat": lat, "lon": lon, "hours": 24},
                )
                safe_times = await self._fetch_json(
                    client,
                    "GET",
                    "/predict/safe-outdoor-times",
                    params={"lat": lat, "lon": lon},
                )
                weekly_summary = await self._fetch_json(
                    client,
                    "GET",
                    "/predict/weekly-summary",
                    params={"lat": lat, "lon": lon},
                )
                fetched_data["forecast_data"] = {
                    "current_air": current_air,
                    "forecast": forecast,
                    "safe_outdoor_times": safe_times,
                    "weekly_summary": weekly_summary,
                }
                data_used.extend(
                    [
                        "air/nearest",
                        "predict/air-quality",
                        "predict/safe-outdoor-times",
                        "predict/weekly-summary",
                    ]
                )

        if not fetched_data:
            data_used.append("none")
            fetched_data["note"] = "No specific keyword matched; using general advisory mode."
        return fetched_data, data_used

    async def answer_environmental_query(
        self, question: str, location: dict[str, Any]
    ) -> VoiceResponse:
        """Answer environmental question with live backend context."""
        fetched_data, data_used = await self._fetch_relevant_data(
            question=question, location=location
        )
        city = str(location.get("city", "Unknown"))
        today = datetime.now(UTC).date().isoformat()
        system_prompt = (
            "You are EcoSentinel, an AI environmental advisor for India.\n"
            "You have access to real-time satellite and sensor data.\n"
            "Answer in 2-3 sentences max. Be specific with numbers.\n"
            "Always end with one practical recommendation.\n"
            f"Today is {today}. User location: {city}.\n"
            f"Context (live data): {json.dumps(fetched_data, ensure_ascii=True)}\n"
            f"User question: {question}"
        )

        if self._llm is None or SystemMessage is None or HumanMessage is None:
            return VoiceResponse(
                question_text=question,
                answer="Live advisor is temporarily unavailable. Please check local air and fire dashboards and avoid outdoor exposure during high PM2.5 periods.",
                data_used=data_used,
                confidence=0.2,
            )

        try:
            response = await self._llm.ainvoke(
                [SystemMessage(content=system_prompt), HumanMessage(content=question)]
            )
            answer_text = str(response.content).strip()
            return VoiceResponse(
                question_text=question,
                answer=answer_text,
                data_used=data_used,
                confidence=0.85,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("LLM answer generation failed: %s", exc)
            return VoiceResponse(
                question_text=question,
                answer="I could not generate a live response right now. Please retry in a moment and avoid high-risk exposure until then.",
                data_used=data_used,
                confidence=0.3,
            )

    async def answer_with_history(
        self,
        messages: list[dict[str, str]],
        question: str,
        location: dict[str, Any],
    ) -> VoiceResponse:
        """Answer with conversational context for follow-up questions."""
        fetched_data, data_used = await self._fetch_relevant_data(
            question=question, location=location
        )
        city = str(location.get("city", "Unknown"))
        today = datetime.now(UTC).date().isoformat()
        history_lines = [
            f"{item.get('role', 'user')}: {item.get('content', '')}" for item in messages[-8:]
        ]
        history_text = "\n".join(history_lines)

        system_prompt = (
            "You are EcoSentinel, an AI environmental advisor for India.\n"
            "You have access to real-time satellite and sensor data.\n"
            "Use the conversation history for continuity, but prioritize latest live data.\n"
            "Answer in 2-3 sentences max. Be specific with numbers.\n"
            "Always end with one practical recommendation.\n"
            f"Today is {today}. User location: {city}.\n"
            f"Context (live data): {json.dumps(fetched_data, ensure_ascii=True)}\n"
            f"Conversation history:\n{history_text}"
        )

        if self._llm is None or SystemMessage is None or HumanMessage is None or AIMessage is None:
            return VoiceResponse(
                question_text=question,
                answer="Live advisor is temporarily unavailable. Please monitor local air quality and limit outdoor activity when PM2.5 is elevated.",
                data_used=data_used + ["conversation_history"],
                confidence=0.2,
            )

        try:
            lc_messages = [SystemMessage(content=system_prompt)]
            for item in messages[-8:]:
                role = item.get("role", "user").lower()
                content = item.get("content", "")
                if role == "assistant":
                    lc_messages.append(AIMessage(content=content))
                else:
                    lc_messages.append(HumanMessage(content=content))
            lc_messages.append(HumanMessage(content=question))

            response = await self._llm.ainvoke(lc_messages)
            answer_text = str(response.content).strip()
            return VoiceResponse(
                question_text=question,
                answer=answer_text,
                data_used=data_used + ["conversation_history"],
                confidence=0.88,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("LLM answer generation with history failed: %s", exc)
            return VoiceResponse(
                question_text=question,
                answer="I could not process the follow-up question right now. Please ask again shortly and continue using a mask in poor air conditions.",
                data_used=data_used + ["conversation_history"],
                confidence=0.3,
            )
