#!/usr/bin/env bash
# Run before uploading to Databricks — fails fast if the bundle is incomplete or misconfigured.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { echo "OK: $1"; }

[[ -f package.json ]] || fail "missing package.json"
if node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).scripts?.build ? 'yes' : 'no'" 2>/dev/null | grep -qx yes; then
  fail 'root package.json still defines "build" — Databricks may try to compile missing source. Use the latest deploy ZIP.'
fi
ok "root package.json has no build script"

for f in \
  server/dist/server/server.js \
  server/dist/server/lib/config.js \
  server/dist/server/lib/env.js \
  server/dist/server/lib/databricksSql.js \
  client/dist/index.html \
  config/queries/dashboard_dt_kpis.obo.sql \
  app.yaml \
  BUNDLE_VERSION.txt; do
  [[ -f "$f" ]] || fail "missing $f"
done
ok "critical files present"

grep -q "dist/server/server.js" server/package.json || fail 'server/package.json start must be: node dist/server/server.js'
ok "server start path correct"

echo ""
echo "Bundle verified. Upload this entire folder to Databricks."
cat BUNDLE_VERSION.txt
