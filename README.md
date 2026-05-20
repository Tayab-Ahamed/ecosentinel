# EcoSentinel

**AI-powered environmental intelligence platform** — real-time air quality, satellite wildfire tracking, computer-vision waste analysis, voice-driven insights, and short-term pollution forecasting in a single full-stack application.

[![CI](https://github.com/Tayab-Ahamed/ecosentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/Tayab-Ahamed/ecosentinel/actions/workflows/ci.yml)

## Highlights

- **Unified dashboard** — PM2.5, fire activity, waste hotspots, and alerts in one responsive UI
- **Live telemetry** — WebSocket feed for air quality, fires, and threshold-based alerts
- **Multimodal AI** — Gemini Vision for waste classification; Whisper + LLM for voice Q&A
- **Forecasting** — Facebook Prophet for 24-hour PM2.5 trends and safer outdoor windows
- **Production-ready API** — FastAPI with OpenAPI docs, PostgreSQL/SQLite persistence, Docker, and Railway/Vercel deployment paths

## Architecture

```text
                    ┌─────────────────────────┐
                    │   Next.js 16 Frontend │
                    │  Dashboard · Map · AI │
                    └───────────┬─────────────┘
                                │ REST + WebSocket
                    ┌───────────▼─────────────┐
                    │     FastAPI Backend     │
                    │  Routers · Services · DB│
                    └──┬────┬────┬──────┬─────┘
           ┌───────────┘    │    │      └──────────────┐
           ▼                ▼    ▼                     ▼
      ┌─────────┐     ┌──────────┐  ┌────────────┐  ┌─────────┐
      │ OpenAQ  │     │NASA FIRMS│  │Gemini/Whisper│  │ Prophet │
      └─────────┘     └──────────┘  └────────────┘  └─────────┘
                                │
                         ┌──────▼──────┐
                         │ PostgreSQL  │
                         │  or SQLite  │
                         └─────────────┘
```

## Tech Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Leaflet, Recharts, Framer Motion |
| **Backend** | FastAPI, Pydantic v2, SQLModel, Alembic, HTTPX, Prophet, OpenAI Whisper |
| **AI / Data** | Google Gemini, OpenAQ, NASA FIRMS |
| **Infrastructure** | Docker Compose, GitHub Actions, Railway, Vercel |

## Features

| Module | Description |
| --- | --- |
| **Air Quality** | Nearest-station lookup, India hotspot rankings, historical charts, India AQI categories |
| **Fire Intelligence** | NASA FIRMS active fires, proximity search, impact summaries |
| **Waste Scanner** | Image upload → Gemini classification with disposal guidance |
| **Voice Assistant** | Speech-to-text and natural-language answers grounded in live API data |
| **Predictions** | PM2.5 forecast, safe outdoor windows, weekly summaries |
| **Carbon Calculator** | Client-side footprint estimator (transport, diet, energy) |
| **Historical Cache** | Persist and query OpenAQ time series via `/api/historical/*` |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- (Optional) Docker for PostgreSQL

### Backend

**Full install (includes Whisper for local speech-to-text):**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env
# Add GEMINI_API_KEY, FIRMS_API_KEY, optional OPENAQ_API_KEY
alembic upgrade head
uvicorn main:app --reload
```

**Lightweight install (API + tests, no PyTorch):**

```powershell
pip install -r requirements-base.txt
$env:ECOSENTINEL_SKIP_WHISPER_INIT = "1"
uvicorn main:app --reload
```

API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)

### Frontend

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Application: [http://localhost:3000](http://localhost:3000)

Toggle **Demo mode** in the sidebar to explore the UI with sample data when API keys are not configured.

### Docker (PostgreSQL + API)

```powershell
docker compose up --build
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes (waste/voice) | Gemini Vision and LLM |
| `FIRMS_API_KEY` | Yes (fires) | NASA FIRMS fire feed |
| `OPENAQ_API_KEY` | No | Authenticated OpenAQ access |
| `DATABASE_URL` | No | Defaults to SQLite; use PostgreSQL in production |
| `FRONTEND_URL` | Prod | Extra CORS origin |
| `ECOSENTINEL_BACKEND_URL` | Prod | Public API URL for the voice agent |
| `ECOSENTINEL_ENV` | Prod | Set to `production` to hide internal errors |
| `ECOSENTINEL_SKIP_WHISPER_INIT` | No | `1` skips Whisper model load |

### Frontend (`frontend/.env.local`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | FastAPI base URL (e.g. `http://localhost:8000`) |

## API Overview

| Group | Endpoints |
| --- | --- |
| **Air** | `/api/air/nearest`, `/api/air/city/{city}`, `/api/air/india-hotspots`, `/api/air/historical/{station_id}` |
| **Fires** | `/api/fires/india`, `/api/fires/near`, `/api/fires/summary` |
| **Waste** | `/api/waste/classify-image`, `/api/waste/hotspots` |
| **Voice** | `/api/voice/query-text`, `/api/voice/query-audio`, `WS /api/ws/voice-chat` |
| **Predictions** | `/api/predict/air-quality`, `/api/predict/safe-outdoor-times` |
| **Historical** | `/api/historical/readings`, `/api/historical/cache`, `/api/historical/sync` |
| **Stats** | `/api/stats/dashboard` |
| **System** | `/health`, `WS /ws/live-feed` |

## Development

### Verify locally (matches CI checks)

```powershell
.\scripts\verify.ps1
```

```bash
./scripts/verify.sh
```

### Run tests

```powershell
cd backend
$env:ECOSENTINEL_SKIP_WHISPER_INIT = "1"
pip install -r requirements-base.txt -r requirements-dev.txt
pytest -v
```

## Deployment

| Service | Target | Notes |
| --- | --- | --- |
| **API** | Railway | `backend/Dockerfile`, health check `/health`, run migrations on start |
| **UI** | Vercel | Deploy `frontend/`; set `NEXT_PUBLIC_API_URL` to your API URL |

Set `ECOSENTINEL_ENV=production`, `FRONTEND_URL`, and `ECOSENTINEL_BACKEND_URL` on the backend. Point the frontend at the deployed HTTPS API.

## Project Structure

```text
ecosentinel/
├── backend/          # FastAPI application, services, Alembic migrations
├── frontend/         # Next.js dashboard and components
├── scripts/          # Local verification scripts
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## License

See [LICENSE](LICENSE).
