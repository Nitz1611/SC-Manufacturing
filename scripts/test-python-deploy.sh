#!/usr/bin/env bash
# Simulates Databricks App deploy: pip install → python app.py (smoke test).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/SC-Manufacturing-Databricks-Deploy"
PORT="${PORT:-8099}"

cd "$DEPLOY"
echo "==> Python Databricks simulation in: $DEPLOY"

echo "==> Step 1/2: pip install"
python3 -m pip install -q -r requirements.txt

echo "==> Step 2/2: python app.py (5s smoke test on port $PORT)"
CONSOLE_DEMO_MODE=true PORT="$PORT" timeout 8 python3 app.py >/tmp/sc-python-deploy-smoke.log 2>&1 &
PID=$!
sleep 3
if curl -sf "http://127.0.0.1:$PORT/api/status" >/tmp/sc-python-deploy-status.json 2>/dev/null; then
  echo "    /api/status OK:"
  cat /tmp/sc-python-deploy-status.json
  echo ""
else
  echo "    /api/status not reachable — check /tmp/sc-python-deploy-smoke.log"
  tail -30 /tmp/sc-python-deploy-smoke.log || true
  exit 1
fi
wait "$PID" 2>/dev/null || true
echo "==> Python Databricks simulation complete."
