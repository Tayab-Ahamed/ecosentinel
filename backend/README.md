# EcoSentinel Backend

Production-ready FastAPI backend for environmental monitoring.

## Features
- Real-time air quality (OpenAQ)
- Fire hotspots (NASA FIRMS)
- Waste classification (Gemini Vision)
- Voice eco-assistant (Whisper + LLM)
- Prophet forecasting
- PostgreSQL persistence (historical data)
- Alembic migrations
- Docker Compose (PG + Redis)

## Local Development

1. Clone & cd backend
2. `pip install -r requirements.txt`
3. Copy `.env.example` to `.env` & set API keys:
   ```
   OPENAQ_API_KEY=your_key
   FIRMS_API_KEY=your_key
   GEMINI_API_KEY=your_key
   ```
4. In root: `docker compose up db` (or local PG)
5. `alembic upgrade head`
6. `uvicorn main:app --reload`

## Docker Full Stack
```
docker compose up --build
```

API at http://localhost:8000/docs

## Migrations
```
alembic revision --autogenerate -m "msg"
alembic upgrade head
```

## Tests
`pytest`

## Deployment
Railway: Deploy Dockerfile + railway.toml
Vercel: Frontend only (proxy API)

## Env Vars
- `DATABASE_URL`
- `REDIS_URL`
- `ECOSENTINEL_SKIP_WHISPER_INIT=1` (CI/prod)

