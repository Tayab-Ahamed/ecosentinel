# EcoSentinel

EcoSentinel is an AI-powered environmental intelligence platform for the Nexora Hackathon 2026. It combines live air-quality data, NASA fire detections, AI waste classification, a voice assistant, and short-term PM2.5 forecasting in one full-stack experience.

## What It Does

- Tracks nearby air quality using OpenAQ and maps PM2.5 conditions around the user.
- Visualizes active fires from NASA FIRMS as live map layers and summary alerts.
- Classifies waste images with Gemini Vision and returns disposal guidance plus local air-quality context.
- Answers environmental questions through a text and voice assistant backed by live backend data.
- Forecasts near-term PM2.5 patterns and highlights safer outdoor time windows.

## Architecture

```text
                         +----------------------+
                         |   Next.js Frontend   |
                         |  Dashboard / Map /   |
                         | Waste / Voice / AQI  |
                         +----------+-----------+
                                    |
                           REST + WebSocket
                                    |
                         +----------v-----------+
                         |    FastAPI Backend   |
                         | Routers + Services   |
                         +----+----+----+------+
                              |    |    |
                    +---------+    |    +------------------+
                    |              |                       |
             +------v------+ +-----v------+        +-------v--------+
             |   OpenAQ    | | NASA FIRMS |        | Gemini / Voice |
             | Air Quality | | Fire Data  |        | Vision / LLM   |
             +-------------+ +------------+        +----------------+
                              |
                       +------v------+
                       |   Prophet   |
                       | Forecasting |
                       +-------------+
```

## Open Source Foundations

- `OpenAQ`
  Used for real-world air-quality readings, nearest-station lookup, historical data, and India hotspot summaries.
- `NASA FIRMS`
  Used for active fire detections, proximity analysis, and fire-to-air-quality alerting.
- `TrashNet-inspired waste workflow`
  Extended into a multimodal waste analysis flow using Gemini Vision, hotspot reporting, and environmental impact guidance.

## Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Recharts, Leaflet, Framer Motion, Axios |
| Backend | FastAPI, Pydantic v2, HTTPX, Prophet, OpenAI Whisper, gTTS |
| AI | Gemini Vision, Gemini-powered voice reasoning |
| Data | OpenAQ, NASA FIRMS |
| Deployment | Railway for backend, Vercel for frontend |

## Repo Structure

```text
ecosentinel/
├── .github/workflows/ci.yml   # Frontend lint/build + backend tests
├── backend/
│   ├── main.py
│   ├── routers/
│   ├── services/
│   ├── models/
│   ├── tests/                 # Pytest smoke tests
│   ├── requirements-base.txt  # API stack (no Whisper / PyTorch)
│   ├── requirements.txt       # Full stack (+ Whisper for local STT)
│   ├── requirements-dev.txt   # Pytest
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── .env.example
├── scripts/
│   ├── verify.ps1             # Windows: same checks as CI
│   └── verify.sh              # Linux/macOS
├── railway.toml
└── LICENSE
```

## Prerequisites

- **Python 3.11+** (3.11 matches `backend/Dockerfile`; avoid mixing older patch tooling on Windows without a C compiler).
- **Node.js 20+** and npm (for the frontend).

## Local Setup

### 1. Backend

**Option A — full features (includes Whisper speech-to-text; installs PyTorch):**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env with your API keys
uvicorn main:app --reload
```

**Option B — API and tests without local Whisper (faster, smaller footprint; same as CI):**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements-base.txt
Copy-Item .env.example .env
$env:ECOSENTINEL_SKIP_WHISPER_INIT = "1"
uvicorn main:app --reload
```

Backend docs: `http://localhost:8000/docs`

### 2. Frontend

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Frontend app: `http://localhost:3000`

## Environment Variables

### Backend

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Gemini Vision and LLM responses |
| `OPENAQ_API_KEY` | Optional OpenAQ authenticated access |
| `FIRMS_API_KEY` | NASA FIRMS fire feed (**required** for non-empty fire data) |
| `OPENWEATHER_API_KEY` | Reserved for future weather context |
| `ECOSENTINEL_BACKEND_URL` | Backend base URL used by the voice agent (use your **public** URL in production) |
| `FRONTEND_URL` | Deployed frontend origin for CORS (in addition to built-in defaults) |
| `ECOSENTINEL_ENV` | Set to `production` on Railway/Docker to hide raw exception text from clients |
| `ECOSENTINEL_SKIP_WHISPER_INIT` | Set to `1` to skip loading Whisper at startup (tests / CI / faster dev without STT) |
| `LIVE_FEED_CITY` | Default websocket city label |
| `LIVE_FEED_LAT` / `LIVE_FEED_LON` | Default websocket coordinates |

### Frontend

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL of the FastAPI backend (local or deployed) |

## Verification and CI

- **GitHub Actions** runs on push/PR: backend `compileall` + `pytest`, frontend `npm run lint` + `npm run build`.
- **Badge (optional):** After the repo is on GitHub, add a status badge with  
  `https://github.com/<you>/<repo>/actions/workflows/ci.yml/badge.svg`.
- **Local (same as CI):**

```powershell
.\scripts\verify.ps1
```

```bash
chmod +x scripts/verify.sh && ./scripts/verify.sh
```

## Hackathon Submission Checklist

- [ ] **Repository:** Root `.gitignore` excludes `.env` and secrets; only `.env.example` files are tracked.
- [ ] **Keys:** `GEMINI_API_KEY`, `FIRMS_API_KEY`, and optional `OPENAQ_API_KEY` set in Railway and/or local `.env`.
- [ ] **Deployed URLs:** Vercel `NEXT_PUBLIC_API_URL` points to your Railway (or other) backend **HTTPS** URL.
- [ ] **CORS:** Railway `FRONTEND_URL` set to your Vercel URL; `ECOSENTINEL_ENV=production` recommended on the backend.
- [ ] **Voice agent:** `ECOSENTINEL_BACKEND_URL` on the server is the **public** API URL (not `localhost`).
- [ ] **Demo:** Record a short walkthrough (dashboard, map, waste, voice or text, forecast) and link it in your submission if required.
- [ ] **CI badge (optional):** Add the workflow badge to this README once the repo is public on GitHub.

## API Summary

### Air

- `GET /api/air/nearest`
- `GET /api/air/city/{city_name}`
- `GET /api/air/india-hotspots`
- `GET /api/air/historical/{station_id}`
- `GET /api/air/aqi-category`

### Fires

- `GET /api/fires/india`
- `GET /api/fires/near`
- `GET /api/fires/summary`
- `GET /api/fires/impact-on-air`

### Waste

- `POST /api/waste/classify-image`
- `POST /api/waste/classify-url`
- `GET /api/waste/impact-stats`
- `POST /api/waste/report-hotspot`
- `GET /api/waste/hotspots`

### Voice

- `POST /api/voice/query-audio`
- `POST /api/voice/query-text`
- `WS /api/ws/voice-chat`

### Predictions

- `GET /api/predict/air-quality`
- `GET /api/predict/safe-outdoor-times`
- `GET /api/predict/weekly-summary`

### System

- `GET /health`
- `WS /ws/live-feed`

## Deployment

### Railway Backend

- `backend/Dockerfile` installs the **full** stack (including Whisper). Set **`ECOSENTINEL_ENV=production`** in the Railway dashboard (the image sets it by default).
- `railway.toml` points at the Dockerfile; health check uses `/health`.
- Set `FRONTEND_URL`, `GEMINI_API_KEY`, `FIRMS_API_KEY`, `ECOSENTINEL_BACKEND_URL`, and other vars from the table above.

### Vercel Frontend

- Set `NEXT_PUBLIC_API_URL` to your Railway backend URL.
- Deploy the `frontend` directory as the Vercel project root.

## Notes

- The frontend is inspired by the provided `v0.dev` export, but wired into the actual backend endpoints and trimmed to the dependencies already present in this repo.
- **Redis** was removed as an unused dependency; add it back only if you implement caching or queues.
- Full voice and forecasting features require the full Python dependency set; use `requirements-base.txt` when you do not need local Whisper (CI and quick API work).
