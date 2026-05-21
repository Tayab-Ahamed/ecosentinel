# EcoSentinel

An enterprise-grade, high-fidelity environmental intelligence platform providing real-time air quality indexing (AQI), satellite active wildfire tracking, computer-vision based waste classification, voice-driven interactive assistance, and predictive PM2.5 forecasting. Built using a robust microservices-aligned architecture with FastAPI and Next.js, and styled using a custom high-fidelity neon glassmorphism theme.

[![CI](https://github.com/Tayab-Ahamed/ecosentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/Tayab-Ahamed/ecosentinel/actions/workflows/ci.yml)

---

## 🖥️ System Architecture

EcoSentinel is designed around a decoupled, highly responsive architecture separating heavy predictive and analytical operations from critical UI interactions:

```text
                     ┌───────────────────────────────────┐
                     │       Next.js 16 Dashboard        │
                     │  Custom UI Theme · SVG Graph Engine│
                     └─────────────────┬─────────────────┘
                                       │ REST / WebSockets
                     ┌─────────────────▼─────────────────┐
                     │          FastAPI Gateway          │
                     │  Routers · Services · Alembic Mig │
                     └───┬─────────┬─────────┬─────────┬─┘
                         │         │         │         │
        ┌────────────────┘         │         │         └────────────────┐
        ▼                          ▼         ▼                          ▼
 ┌──────────────┐           ┌──────────────┐ ┌──────────────┐     ┌───────────┐
 │   OpenAQ     │           │  NASA FIRMS  │ │Gemini Vision │     │ Prophet   │
 │ Air Quality  │           │Active Fires  │ │& Whisper Q&A │     │ Forecasting│
 └──────────────┘           └──────────────┘ └──────────────┘     └───────────┘
                                             │
                                      ┌──────▼──────┐
                                      │ PostgreSQL  │
                                      │  or SQLite  │
                                      └─────────────┘
```

---

## ✨ Features & Production-Ready Capabilities

### 1. Unified Telemetry Dashboard
* **Real-time Air Quality**: Telemetry tracking using nearest-station spatial searches, interactive AQI categories mapping (India AQI Standard), and dynamic rankings of national hotspots.
* **NASA Active Fire Intelligence**: Real-time ingest of NASA FIRMS satellite data, enabling active wildfire hotspot detection, proximity-based searches, and comprehensive risk mitigation summaries.
* **Responsive Leaflet Map Engine**: Layers mapping for real-time PM2.5 coordinates, active thermal anomalies, and community debris reports.

### 2. Multi-Modal Integrations
* **Computer Vision Waste Scanner**: Multimodal image analysis using **Google Gemini Vision** models. Users capture or upload debris photos, and the model classifies the waste, calculates decomposed timelines, outputs environmental impact ratings, and renders standard disposal guides.
* **Voice-Activated Environmental Assistant**: Conversational voice assistant leveraging **OpenAI Whisper** for high-accuracy speech translation, integrated with a FastAPI WebSockets channel (`/api/ws/voice-chat`) and grounded dynamically using real-time local openAQ and FIRMS telemetry feeds.

### 3. Predictive Environmental Modeling
* **Prophet PM2.5 Forecasts**: Integrated **Facebook Prophet** forecasting engine providing 24-hour predictive timeline modeling of PM2.5.
* **Safe Outdoor Activity Windows**: Algorithmic assessment of future air safety, highlighting time windows in the next 24 hours where PM2.5 levels are forecasted to be optimal for outdoor activity.

### 4. Interactive Carbon Reduction & Action Center
* **Carbon Reduction Advisor**: Integrates deep learning recommendations with a fast offline mathematical fallback algorithm to construct custom, context-aware carbon plans.
* **Gamified Action Tracker**: Features persistent client-side tracking using standard `localStorage` schema design. Users commit to reduction goals, complete daily challenges, and dynamically scale up their **Eco-Points (XP)** and cumulative CO₂ offset metrics.
* **Zero-Dependency SVG Projections**: Implements lightweight custom vector-graphic projection charts using visual glows, linear gradients, and layout overlays to compare current annual averages with targets and national standards without external charting overhead.

---

## 🎨 Custom Neon Glassmorphism Design System

EcoSentinel adopts a custom high-fidelity design system, shifting from standard generic UI colors to a premium neon-glassmorphic dark aesthetic:

* **Color Palette**:
  * **Midnight Blue** (`#0c1321`): The primary foundation background, creating an atmospheric, immersive visual style.
  * **Cobalt Sky** (`#4cd7f6`): Custom secondary accent representing data lines, inputs, graphs, and voice modules.
  * **Vibrant Emerald** (`#4edea3`): Core success primary color indicating target completions, checklist hits, and active badges.
* **Premium Accents**: Seamlessly blends backdrop blur filters (`backdrop-blur-xl`), linear gradient glows, and translucent card panels.

---

## 🛠️ Tech Stack & Dependencies

| Layer | Technology Highlights |
| --- | --- |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, React Leaflet, Recharts, Framer Motion |
| **Backend** | FastAPI, SQLModel (Pydantic v2 + SQLAlchemy), Alembic Migrations, HTTPX client |
| **Integrations**| Google Gemini API, Prophet (Time Series Forecasting), OpenAI Whisper (Speech-to-Text) |
| **Data Telemetry** | NASA FIRMS API, OpenAQ API |
| **Infrastructure** | PostgreSQL, Docker Compose, GitHub Actions CI, Pytest Suite |

---

## 🚀 Development Setup & Environment Config

To prevent local conflicts, the application uses port **`3005`** for the Next.js frontend and **`8005`** for the FastAPI backend.

### 1. Backend Service
Ensure Python 3.11+ is installed.

```powershell
cd backend
python -m venv .venv
# Activate environment (Windows)
.\.venv\Scripts\activate
# Activate environment (Linux/Mac)
# source .venv/bin/activate

# Install full development requirements
pip install -r requirements.txt

# Configure environment keys
Copy-Item .env.example .env
# Edit .env and supply GEMINI_API_KEY, FIRMS_API_KEY, etc.

# Run database migrations
alembic upgrade head

# Launch local backend server
uvicorn main:app --host 127.0.0.1 --port 8005 --reload
```

*For a lightweight install without native Torch/Whisper initializations:*
```powershell
pip install -r requirements-base.txt
$env:ECOSENTINEL_SKIP_WHISPER_INIT = "1"
uvicorn main:app --host 127.0.0.1 --port 8005 --reload
```

Backend interactive API documentation is available at [http://127.0.0.1:8005/docs](http://127.0.0.1:8005/docs)

### 2. Frontend Application
Ensure Node.js 20+ is installed.

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8005

# Run frontend in development mode
npm run dev -- -p 3005
```

Open [http://localhost:3005](http://localhost:3005) in your browser. Toggle **Demo mode** in the sidebar to explore full UI data rendering without active backend keys.

---

## 🧪 Verification & Compiler Health

### Backend Pytest Suite
Run tests locally to verify API security, schema boundaries, and validation layers:
```powershell
cd backend
$env:ECOSENTINEL_SKIP_WHISPER_INIT = "1"
pytest -v
```

### Frontend Production Compiles
To verify that all Next.js App Routing and TypeScript classes compile cleanly:
```powershell
cd frontend
npm run build
```

---

## 📈 Engineering Accomplishments & Resume Highlights

* **Multi-Source Telemetry Pipelines**: Designed a robust caching layers architecture matching geospatial stations, avoiding redundant external calls and optimizing NASA FIRMS active fire coordinate lookups.
* **Low-Latency Conversational Channels**: Leveraged high-frequency FastAPI WebSockets channels to support real-time user-to-assistant voice query-response pipelines.
* **Performant Graphics Engine**: Eliminated heavy external graphics libraries by building a zero-dependency SVG data projections column chart featuring dynamic offset shifts and linear gradients.
* **Green GitHub Actions CI**: Implemented robust unit/integration tests and automated formatters (`ruff` and Next.js TSX lint compilers), maintaining a strictly verified green CI status.

---

## 📂 Project Directory Structure

```text
ecosentinel/
├── backend/          # FastAPI server, Alembic migrations, SQLModel entities
│   ├── routers/      # Air, Fires, Waste, Voice, Predictions, & Carbon routes
│   ├── services/     # API client wrappers and Prophet time-series models
│   └── tests/        # Pytest integration and mock validation sweeps
├── frontend/         # Next.js 16 client, pages, static asset pipelines
│   ├── app/          # App router setups & global styling variables
│   ├── components/   # Fully overhauled high-fidelity components
│   └── lib/          # Fetch clients & environmental calculation utilities
└── .github/          # Automated GitHub Actions CI workflow definitions
```

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
