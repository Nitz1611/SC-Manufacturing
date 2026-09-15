#!/usr/bin/env bash
# Simulates Databricks App deploy: npm install → npm run build → npm start (smoke test).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/SC-Manufacturing-Databricks-Deploy"
PORT="${PORT:-8099}"

cd "$DEPLOY"
echo "==> Databricks simulation in: $DEPLOY"
echo "==> Step 1/3: npm install (production)"
rm -rf node_modules client/node_modules server/node_modules
NODE_ENV=production npm install

echo "==> Step 2/3: npm run build"
npm run build

echo "==> Step 3/3: npm start (5s smoke test on port $PORT)"
PORT="$PORT" timeout 5 npm start >/tmp/sc-deploy-smoke.log 2>&1 &
PID=$!
sleep 2
if curl -sf "http://127.0.0.1:$PORT/api/status" >/tmp/sc-deploy-status.json 2>/dev/null; then
  echo "    /api/status OK:"
  cat /tmp/sc-deploy-status.json
  echo ""
else
  echo "    /api/status not reachable (env may be missing — check /tmp/sc-deploy-smoke.log)"
  tail -20 /tmp/sc-deploy-smoke.log || true
fi
wait "$PID" 2>/dev/null || true
echo "==> Databricks simulation complete."
