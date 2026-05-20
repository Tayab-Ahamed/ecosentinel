#!/usr/bin/env bash
set -euo pipefail
echo "== EcoSentinel verify =="

echo ""
echo "[backend] ruff + pytest"
cd "$(dirname "$0")/../backend"
export ECOSENTINEL_SKIP_WHISPER_INIT=1
export DATABASE_URL="sqlite+aiosqlite:///./verify_ecosentinel.db"
python -m pip install -q ruff -r requirements-base.txt -r requirements-dev.txt
ruff check .
ruff format . --check
python -m pytest -v

echo ""
echo "[frontend] lint + build"
cd "../frontend"
npm ci
npm run lint
npm run build

echo ""
echo "Done."
