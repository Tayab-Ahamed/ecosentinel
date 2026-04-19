"""Voice Q&A API routes and WebSocket streaming chat."""

import base64
import json
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from models.schemas import VoiceResponse
from services.voice_llm_agent import EcoSentinelVoiceAgent
from services.whisper_client import WhisperClient

router: APIRouter = APIRouter(tags=["voice-agent"])
whisper_client: WhisperClient = WhisperClient()
llm_agent: EcoSentinelVoiceAgent = EcoSentinelVoiceAgent()


class VoiceTextQueryRequest(BaseModel):
    """Text query payload for voice agent."""

    question: str
    lat: float
    lon: float
    city: str = "Unknown"


class VoiceAudioQueryResponse(BaseModel):
    """Audio query response payload with optional synthesized speech."""

    question: str
    answer: str
    audio_base64: str
    data_used: list[str]
    confidence: float


@router.post("/voice/query-audio", response_model=VoiceAudioQueryResponse)
async def query_audio(
    audio: UploadFile = File(...),
    lat: float = Form(...),
    lon: float = Form(...),
    city: str = Form(default="Unknown"),
) -> VoiceAudioQueryResponse:
    """Transcribe audio, answer with LLM, and synthesize speech."""
    try:
        audio_bytes = await audio.read()
        transcript = await whisper_client.transcribe_audio(audio_bytes=audio_bytes)
        if not transcript:
            raise HTTPException(status_code=400, detail="Unable to transcribe audio input.")

        response = await llm_agent.answer_environmental_query(
            question=transcript,
            location={"lat": lat, "lon": lon, "city": city},
        )
        tts_bytes = await whisper_client.text_to_speech(text=response.answer)
        encoded_audio = base64.b64encode(tts_bytes).decode("utf-8") if tts_bytes else ""
        return VoiceAudioQueryResponse(
            question=transcript,
            answer=response.answer,
            audio_base64=encoded_audio,
            data_used=response.data_used,
            confidence=response.confidence,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Audio query failed: {exc}") from exc


@router.post("/voice/query-text", response_model=VoiceResponse)
async def query_text(payload: VoiceTextQueryRequest) -> VoiceResponse:
    """Answer text query directly without transcription."""
    try:
        return await llm_agent.answer_environmental_query(
            question=payload.question,
            location={"lat": payload.lat, "lon": payload.lon, "city": payload.city},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Text query failed: {exc}") from exc


@router.websocket("/ws/voice-chat")
async def websocket_voice_chat(websocket: WebSocket) -> None:
    """Stream conversational responses for voice chat sessions."""
    await websocket.accept()
    history: list[dict[str, str]] = []
    audio_buffer = bytearray()
    session_location: dict[str, Any] = {"lat": 12.9716, "lon": 77.5946, "city": "Bengaluru"}

    try:
        while True:
            message = await websocket.receive()
            if "bytes" in message and message["bytes"] is not None:
                audio_buffer.extend(message["bytes"])
                continue

            text_payload = message.get("text")
            if not text_payload:
                continue

            if text_payload == "__END_AUDIO__":
                transcript = await whisper_client.transcribe_audio(audio_bytes=bytes(audio_buffer))
                audio_buffer.clear()
                if not transcript:
                    await websocket.send_json({"type": "error", "message": "Could not transcribe audio chunk stream."})
                    continue
                response = await llm_agent.answer_with_history(
                    messages=history,
                    question=transcript,
                    location=session_location,
                )
                history.append({"role": "user", "content": transcript})
                history.append({"role": "assistant", "content": response.answer})
                for chunk in response.answer.split():
                    await websocket.send_json({"type": "text_chunk", "chunk": f"{chunk} "})
                await websocket.send_json(
                    {
                        "type": "done",
                        "question": transcript,
                        "answer": response.answer,
                        "data_used": response.data_used,
                        "confidence": response.confidence,
                    }
                )
                continue

            try:
                payload = json.loads(text_payload)
            except json.JSONDecodeError:
                payload = {"question": text_payload}

            if "location" in payload and isinstance(payload["location"], dict):
                session_location = {
                    "lat": float(payload["location"].get("lat", session_location["lat"])),
                    "lon": float(payload["location"].get("lon", session_location["lon"])),
                    "city": str(payload["location"].get("city", session_location["city"])),
                }

            question = str(payload.get("question", "")).strip()
            if not question:
                continue

            response = await llm_agent.answer_with_history(
                messages=history,
                question=question,
                location=session_location,
            )
            history.append({"role": "user", "content": question})
            history.append({"role": "assistant", "content": response.answer})

            for chunk in response.answer.split():
                await websocket.send_json({"type": "text_chunk", "chunk": f"{chunk} "})
            await websocket.send_json(
                {
                    "type": "done",
                    "question": question,
                    "answer": response.answer,
                    "data_used": response.data_used,
                    "confidence": response.confidence,
                }
            )
    except WebSocketDisconnect:
        return
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": f"Voice chat error: {exc}"})
        await websocket.close(code=1011)
