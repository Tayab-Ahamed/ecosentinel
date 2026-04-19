#!/usr/bin/env bash
set -euo pipefail
echo "== EcoSentinel verify =="

echo ""
echo "[backend] pytest + compileall"
cd "$(dirname "$0")/../backend"
export ECOSENTINEL_SKIP_WHISPER_INIT=1
python -m pip install -q -r requirements-base.txt -r requirements-dev.txt
python -m compileall -q .
python -m pytest -q

echo ""
echo "[frontend] lint + build"
cd "../frontend"
npm ci
npm run lint
npm run build

echo ""
echo "Done."
