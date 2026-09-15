#!/usr/bin/env bash
# Refresh SC-Manufacturing-Databricks-Deploy/ for pure Flask deploy (no npm/React).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/SC-Manufacturing-Databricks-Deploy"

cd "$ROOT"
echo "==> Copying pure Flask deploy bundle..."
mkdir -p "$DEPLOY/templates" "$DEPLOY/py_server" "$DEPLOY/config/queries"

rm -rf "$DEPLOY/client" "$DEPLOY/server" "$DEPLOY/node_modules"
rm -f "$DEPLOY/package.json" "$DEPLOY/package-lock.json" "$DEPLOY/.npmrc"

for f in app.py app.yaml requirements.txt cache.py views.py supervisor.py claude_supervisor.py .env.example; do
  cp "$ROOT/$f" "$DEPLOY/$f"
done
cp -a "$ROOT/templates/." "$DEPLOY/templates/"
rm -rf "$DEPLOY/py_server" "$DEPLOY/config"
cp -a "$ROOT/py_server" "$DEPLOY/py_server"
cp -a "$ROOT/config" "$DEPLOY/config"

cat > "$DEPLOY/setup.sh" <<'SETUP'
#!/usr/bin/env bash
set -euo pipefail
pip install -r requirements.txt
echo "Python dependencies installed."
SETUP
chmod +x "$DEPLOY/setup.sh"

echo "$(date -u +%Y-%m-%d) flask-pure-python" > "$DEPLOY/BUNDLE_VERSION.txt"
echo "==> Deploy bundle at: $DEPLOY"
