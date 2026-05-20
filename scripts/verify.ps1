# EcoSentinel local verification (aligned with GitHub Actions).
$ErrorActionPreference = "Stop"
Write-Host "== EcoSentinel verify ==" -ForegroundColor Cyan

Write-Host "`n[backend] ruff + pytest" -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "..\backend")
$env:ECOSENTINEL_SKIP_WHISPER_INIT = "1"
$env:DATABASE_URL = "sqlite+aiosqlite:///./verify_ecosentinel.db"
python -m pip install -q ruff -r requirements-base.txt -r requirements-dev.txt
ruff check .
ruff format . --check
python -m pytest -v
Pop-Location

Write-Host "`n[frontend] lint + build" -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "..\frontend")
npm ci
npm run lint
npm run build
Pop-Location

Write-Host "`nDone." -ForegroundColor Green
