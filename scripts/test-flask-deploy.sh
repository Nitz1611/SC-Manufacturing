#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/SC-Manufacturing-Databricks-Deploy"
PORT="${PORT:-8099}"

cd "$DEPLOY"
python3 -m pip install -q -r requirements.txt
PORT="$PORT" timeout 8 python3 app.py >/tmp/sc-flask-deploy.log 2>&1 &
sleep 3
curl -sf "http://127.0.0.1:$PORT/api/status" | python3 -m json.tool | head -20
curl -sf "http://127.0.0.1:$PORT/" -o /dev/null && echo "UI (templates/index.html) OK"
echo "==> Flask deploy smoke test complete."
