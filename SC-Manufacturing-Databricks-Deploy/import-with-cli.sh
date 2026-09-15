#!/usr/bin/env bash
# Upload deploy bundle to Databricks Workspace (avoids UI import errors on .js / package.json)
# Usage: ./import-with-cli.sh "/Workspace/Users/you@company.com/SC-Manufacturing"
set -euo pipefail

TARGET="${1:?Usage: $0 /Workspace/Users/you@company.com/SC-Manufacturing}"
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Uploading from: $ROOT"
echo "Target:         $TARGET"
echo ""

if ! command -v databricks >/dev/null 2>&1; then
  echo "Install Databricks CLI: https://docs.databricks.com/en/dev-tools/cli/index.html" >&2
  exit 1
fi

databricks sync "$ROOT" "$TARGET" --full --overwrite

echo ""
echo "Done. Next in Databricks terminal:"
echo "  chmod +x setup.sh && ./setup.sh"
echo "  npm start"
