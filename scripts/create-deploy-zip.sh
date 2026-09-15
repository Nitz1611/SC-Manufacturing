#!/usr/bin/env bash
# Create SC-Manufacturing-Databricks-Deploy.zip from the deploy folder (run from repo root).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/SC-Manufacturing-Databricks-Deploy"
OUT="$ROOT/SC-Manufacturing-Databricks-Deploy.zip"

cd "$ROOT"
[[ -d "$DEPLOY" ]] || { echo "Missing $DEPLOY" >&2; exit 1; }
bash "$DEPLOY/verify-upload.sh"

rm -f "$OUT"
(cd "$ROOT" && zip -r "$OUT" SC-Manufacturing-Databricks-Deploy -x "*/node_modules/*")
ls -lh "$OUT"
echo "Created: $OUT"
