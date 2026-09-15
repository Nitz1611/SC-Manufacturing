#!/usr/bin/env bash
# Run once after copying this folder to Databricks (notebook terminal or App shell).
set -euo pipefail
cd "$(dirname "$0")"
echo "Installing production dependencies..."
npm ci --omit=dev
echo ""
echo "Setup complete."
echo "  Start locally:  npm start"
echo "  Health check:   curl http://localhost:8000/api/status"
echo "  Or deploy as a Databricks App using app.yaml"
