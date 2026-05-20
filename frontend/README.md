# EcoSentinel Web App

Next.js 16 dashboard for real-time environmental monitoring.

## Setup

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL` to your FastAPI backend (default `http://localhost:8000`).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run start` | Run production build |

## Demo Mode

Use the sidebar toggle to load sample air, fire, and forecast data when API keys are unavailable — useful for local UI development and presentations.
