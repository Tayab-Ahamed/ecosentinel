# EcoSentinel local verification (backend without Whisper — same as CI).
$ErrorActionPreference = "Stop"
Write-Host "== EcoSentinel verify ==" -ForegroundColor Cyan

Write-Host "`n[backend] pytest + compileall" -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "..\backend")
$env:ECOSENTINEL_SKIP_WHISPER_INIT = "1"
python -m pip install -q -r requirements-base.txt -r requirements-dev.txt
python -m compileall -q .
python -m pytest -q
Pop-Location

Write-Host "`n[frontend] lint + build" -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "..\frontend")
npm ci
npm run lint
npm run build
Pop-Location

Write-Host "`nDone." -ForegroundColor Green
