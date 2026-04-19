"""Local Whisper + gTTS voice processing pipeline."""

import asyncio
import logging
import tempfile
from io import BytesIO
from pathlib import Path
from typing import Any, Tuple

try:
    import whisper
except ModuleNotFoundError:  # pragma: no cover - depends on local install
    whisper = None  # type: ignore[assignment]

try:
    from gtts import gTTS
except ModuleNotFoundError:  # pragma: no cover - depends on local install
    gTTS = None  # type: ignore[assignment]

from services.voice_llm_agent import EcoSentinelVoiceAgent

logger = logging.getLogger(__name__)


class WhisperClient:
    """Service for local speech-to-text and text-to-speech."""

    SUPPORTED_EXTENSIONS = (".wav", ".mp3", ".webm", ".ogg")

    def __init__(self) -> None:
        self.model_name = "base"
        self._model: Any | None = None
        self.voice_agent = EcoSentinelVoiceAgent()

    async def initialize_model(self) -> bool:
        """Load Whisper model once and keep in memory."""
        if self._model is not None:
            return True
        if whisper is None:
            logger.warning("Whisper is not installed; voice transcription will be unavailable.")
            return False
        try:
            self._model = await asyncio.to_thread(whisper.load_model, self.model_name)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to load Whisper model '%s': %s", self.model_name, exc)
            self._model = None
            return False

    async def _transcribe_file(self, file_path: str) -> str:
        """Run Whisper transcription on a temporary file path."""
        if self._model is None:
            loaded = await self.initialize_model()
            if not loaded:
                return ""
        result = await asyncio.to_thread(self._model.transcribe, file_path)
        return str(result.get("text", "")).strip()

    async def transcribe_audio(self, audio_bytes: bytes) -> str:
        """Transcribe uploaded audio bytes using local Whisper model."""
        if not audio_bytes:
            return ""

        for extension in self.SUPPORTED_EXTENSIONS:
            temp_path = ""
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as temp_file:
                    temp_file.write(audio_bytes)
                    temp_file.flush()
                    temp_path = temp_file.name
                transcript = await self._transcribe_file(temp_path)
                if transcript:
                    return transcript
            except Exception as exc:  # noqa: BLE001
                logger.error("Whisper transcription failed for %s: %s", extension, exc)
            finally:
                if temp_path:
                    try:
                        Path(temp_path).unlink(missing_ok=True)
                    except Exception as cleanup_exc:  # noqa: BLE001
                        logger.warning("Failed to cleanup temp file %s: %s", temp_path, cleanup_exc)
        return ""

    async def text_to_speech(self, text: str) -> bytes:
        """Convert text to MP3 bytes using gTTS."""
        if not text.strip():
            return b""
        if gTTS is None:
            logger.warning("gTTS is not installed; text-to-speech will be unavailable.")
            return b""
        try:
            tts = gTTS(text=text, lang="en")
            buffer = BytesIO()
            await asyncio.to_thread(tts.write_to_fp, buffer)
            return buffer.getvalue()
        except Exception as exc:  # noqa: BLE001
            logger.error("text_to_speech failed: %s", exc)
            return b""

    async def transcribe_and_answer(self, audio_bytes: bytes) -> Tuple[str, str]:
        """Backwards-compatible helper for existing voice route."""
        transcript = await self.transcribe_audio(audio_bytes=audio_bytes)
        if not transcript:
            return "", "I could not transcribe your audio. Please try again with a clearer recording."
        response = await self.voice_agent.answer_environmental_query(
            question=transcript,
            location={"lat": 12.9716, "lon": 77.5946, "city": "Bengaluru"},
        )
        return transcript, response.answer
