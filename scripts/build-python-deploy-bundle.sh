#!/usr/bin/env bash
# Build React UI from source, then refresh SC-Manufacturing-Databricks-Deploy/ for Python Flask deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/SC-Manufacturing-Databricks-Deploy"

cd "$ROOT"
echo "==> Building React client (client/dist)..."
npm run build --workspace=client 2>/dev/null || npm run build:client 2>/dev/null || npm run build

echo "==> Copying Python deploy bundle..."
mkdir -p "$DEPLOY/client" "$DEPLOY/py_server" "$DEPLOY/config/queries"

rm -rf "$DEPLOY/client/dist" "$DEPLOY/py_server" "$DEPLOY/config/queries"
rm -rf "$DEPLOY/server" "$DEPLOY/node_modules" "$DEPLOY/package.json" "$DEPLOY/package-lock.json" "$DEPLOY/.npmrc"

cp -a "$ROOT/client/dist" "$DEPLOY/client/dist"
cp -a "$ROOT/py_server" "$DEPLOY/py_server"
cp -a "$ROOT/config/queries" "$DEPLOY/config/queries"
cp "$ROOT/app.py" "$DEPLOY/app.py"
cp "$ROOT/app.yaml" "$DEPLOY/app.yaml"
cp "$ROOT/requirements.txt" "$DEPLOY/requirements.txt"

if [[ -f "$ROOT/.env.example" ]]; then
  cp "$ROOT/.env.example" "$DEPLOY/.env.example"
fi

cat > "$DEPLOY/setup.sh" <<'SETUP'
#!/usr/bin/env bash
# Install Python dependencies for Databricks App (no Node required).
set -euo pipefail
pip install -r requirements.txt
echo "Python dependencies installed."
SETUP
chmod +x "$DEPLOY/setup.sh"

echo "$(date -u +%Y-%m-%d) python-flask" > "$DEPLOY/BUNDLE_VERSION.txt"

echo "==> Python deploy bundle refreshed at: $DEPLOY"
echo "    Next: npm run test:deploy:python"
