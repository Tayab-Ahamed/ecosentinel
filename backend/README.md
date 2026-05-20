# EcoSentinel API

FastAPI backend for environmental monitoring, AI-assisted waste analysis, and air-quality forecasting.

## Capabilities

- OpenAQ air-quality integration with station fallbacks
- NASA FIRMS wildfire detection and proximity alerts
- Gemini Vision waste classification
- Whisper speech-to-text and LLM voice agent
- Prophet PM2.5 forecasting
- SQLModel persistence with Alembic migrations (PostgreSQL or SQLite)

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements-base.txt   # or requirements.txt for Whisper
Copy-Item .env.example .env
alembic upgrade head
uvicorn main:app --reload
```

## Migrations

```powershell
alembic revision --autogenerate -m "description"
alembic upgrade head
```

## Tests

```powershell
$env:ECOSENTINEL_SKIP_WHISPER_INIT = "1"
pip install -r requirements-base.txt -r requirements-dev.txt
pytest -v
```

## Docker

From the repository root:

```powershell
docker compose up --build
```

## Environment

See `.env.example` for all variables. Minimum for live data: `GEMINI_API_KEY`, `FIRMS_API_KEY`.
