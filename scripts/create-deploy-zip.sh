#!/usr/bin/env bash
# Create scm-deploy.zip with a short internal folder name (for Windows path limits).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/SC-Manufacturing-Databricks-Deploy"
OUT="$ROOT/scm-deploy.zip"
TEMP="$(mktemp -d)/scm-deploy"

cd "$ROOT"
[[ -d "$DEPLOY" ]] || { echo "Missing $DEPLOY" >&2; exit 1; }
bash "$DEPLOY/verify-upload.sh"

mkdir -p "$TEMP"
cp -a "$DEPLOY/." "$TEMP/"
rm -rf "$TEMP/node_modules" 2>/dev/null || true
rm -f "$OUT"
(cd "$(dirname "$TEMP")" && zip -r "$OUT" "scm-deploy")
rm -rf "$(dirname "$TEMP")"
ls -lh "$OUT"
echo "Created: $OUT"
echo "Windows: extract to C:/scm/ (short path)"
