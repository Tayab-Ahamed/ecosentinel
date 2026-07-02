# EcoSentinel

EcoSentinel is an enterprise-grade environmental intelligence platform offering real-time air quality monitoring, satellite active wildfire tracking, computer-vision based waste classification, voice-activated assistance, and predictive PM2.5 forecasting.

---

## 🚀 Key Features

* **3D Environmental Globe**: Interactive WebGL-based Three.js holographic particle globe rendering local AQI atmospheric colors, orbiting air-current rings, and active wildfire thermal anomalies.
* **NASA Wildfire Map**: Decoupled geospatial Leaflet map tracing active fire points with animated concentric smoke plume dispersion models.
* **AR Waste Scanner**: Multimodal computer-vision waste classification and before/after cleanup verification powered by **Google Gemini Vision**, equipped with interactive HUD overlays and 3D card tilt effects.
* **Voice AI Assistant**: WebSockets-driven conversational voice agent using **OpenAI Whisper** and **Gemini Flash**, featuring real-time audio-responsive canvas wave animations.
* **Predictive Analytics**: Integrated **Facebook Prophet** forecasting engine providing 24-hour multi-pollutant (PM2.5, NO₂, CO₂) trend timelines and safe outdoor window recommendations.
* **PWA & Web Push Alerts**: Desktop push notifications for local environmental hazard triggers, paired with standalone Progressive Web App installability.
* **Carbon Action Center**: Gamified footprint calculator with persistent local storage achievements, XP accumulation, and a procedural 3D forest simulator.

---

## 🛠️ Tech Stack

* **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Three.js, React Leaflet, Recharts, Framer Motion.
* **Backend**: FastAPI, SQLModel (Pydantic v2 + SQLAlchemy), Alembic Migrations, PostgreSQL / SQLite.
* **Integrations**: Google Gemini API, Facebook Prophet, OpenAI Whisper, NASA FIRMS, OpenAQ.

---

## ⚙️ Quick Start

### 1. Backend Setup
Ensure Python 3.11+ is installed.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .\.venv\Scripts\activate
pip install -r requirements-base.txt
cp .env.example .env       # Configure GEMINI_API_KEY, FIRMS_API_KEY, etc.
alembic upgrade head
uvicorn main:app --host 127.0.0.1 --port 8005 --reload
```

*Backend docs will be live at [http://127.0.0.1:8005/docs](http://127.0.0.1:8005/docs).*

### 2. Frontend Setup
Ensure Node.js 20+ is installed.

```bash
cd frontend
npm install
cp .env.example .env.local  # Set NEXT_PUBLIC_API_URL=http://localhost:8005
npm run dev -- -p 3005
```

*Open [http://localhost:3005](http://localhost:3005) in your browser. Toggle **Demo Mode** in the sidebar to review all interfaces without active API keys.*

---

## 🧪 Verification

### Run Backend Tests
```bash
cd backend
$env:ECOSENTINEL_SKIP_WHISPER_INIT="1"  # Windows PowerShell
pytest -v
```

### Run Frontend Build
```bash
cd frontend
npm run build
```
