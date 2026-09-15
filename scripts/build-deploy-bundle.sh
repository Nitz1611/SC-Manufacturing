#!/usr/bin/env bash
# Build from source, then refresh SC-Manufacturing-Databricks-Deploy/ for Databricks upload.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/SC-Manufacturing-Databricks-Deploy"

cd "$ROOT"
echo "==> Building client + server from source..."
npm run build

echo "==> Copying build artifacts into deploy bundle..."
mkdir -p "$DEPLOY/client" "$DEPLOY/server" "$DEPLOY/config/queries"
rm -rf "$DEPLOY/client/dist" "$DEPLOY/server/dist" "$DEPLOY/config/queries"
cp -a "$ROOT/client/dist" "$DEPLOY/client/dist"
cp -a "$ROOT/server/dist" "$DEPLOY/server/dist"
cp -a "$ROOT/config/queries" "$DEPLOY/config/queries"

echo "==> Deploy bundle refreshed at: $DEPLOY"
echo "    Next: npm run test:deploy"
