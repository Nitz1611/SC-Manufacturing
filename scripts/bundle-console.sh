#!/usr/bin/env bash
# One-time dev build: bundle dashboard engine to static/js (no React at runtime).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm install esbuild chart.js --no-save 2>/dev/null || npm install esbuild chart.js
npx esbuild scripts/console-entry.ts \
  --bundle \
  --outfile=static/js/console-engine.js \
  --format=iife \
  --platform=browser \
  --minify
cp client/src/styles/boot.css static/css/boot.css
cp client/src/styles/console.css static/css/console.css
cp client/public/img/pepsico-logo.gif static/img/pepsico-logo.gif 2>/dev/null || true
echo "Built static/js/console-engine.js"
