# EcoSentinel Ready-to-Run TODO
Track steps to improve, add missing, make fully runnable.

## Current Status
- Deps installed (.venv/node_modules)
- DB/Alembic setup (Phase 1 done)
- docker-compose ready
- Missing: .env.example templates, prod Dockerfile tweak, auth/tests (later)

## Steps to Complete (Approved Plan)

### 1. Create Config Templates [DONE]
- [x] Create backend/.env.example (API keys/DB)
- [x] Create frontend/.env.local.example (API_URL)

### 2. Update Files [DONE]
- [x] Update backend/Dockerfile (prod CMD)
- [x] Update this TODO.md (progress)

### 3. Run & Test [PARTIAL]
- [ ] Backend: alembic upgrade head (docker startup handles)
- [x] docker-compose up (db/redis/backend)

- [ ] .\scripts\verify.ps1
- [ ] Frontend: cd frontend && npm run dev
- [ ] Test: localhost:3000 + localhost:8000/docs + /health

### 4. Optional Polish (Post-Run)
- [ ] Phase 2: Auth (FastAPI-Users)
- [ ] Tests expansion
- [ ] Redis cache

Progress: 4/10 complete. Next: DB migration & docker-compose up.

