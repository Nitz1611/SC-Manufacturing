# SC Manufacturing Console — Pure Flask (no React)

Branch: `cursor/flask-pure-python-e63a`

Manufacturing console in **Python + Flask only** — no npm, no React, no Node at runtime.

Structure matches Sravani's module layout, with the React migration SQL engine available under `/api/metrics/*`.

## Project layout

```
app.py                  Flask entry + Insights/RCA/Ask routes
views.py                Direct SQL for KPI cards (MEASURE)
cache.py                File cache (cache.json at runtime)
supervisor.py           MAS Supervisor / Genie client
claude_supervisor.py    Claude direct mode (USE_CLAUDE_DIRECT=true)
templates/
  index.html            Full UI (inline CSS/JS, Chart.js CDN)
py_server/              Direct-SQL KPI engine (from React migration)
config/queries/         Named SQL files for py_server
requirements.txt
app.yaml                Databricks App: python app.py
```

## Run locally

```bash
pip install -r requirements.txt
cp .env.example .env   # edit credentials
python app.py
```

Open http://localhost:8000

## UI tabs (templates/index.html)

| Tab | API |
|-----|-----|
| Insights | `POST /api/dashboard` → poll `GET /api/job/<id>` |
| Root Cause Analysis | `POST /api/rca` |
| Ask Genie | `POST /api/ask` |
| Fast SQL widgets | `POST /api/views`, `GET /api/filters` |

## KPI SQL API (ported from React branch)

Mounted at **`/api/metrics`** to avoid route clashes with Sravani's `/api/status` and `/api/job`:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/metrics/console-data` | Full metrics bundle (heatmaps, filters) |
| `POST /api/metrics/analytics/query/<key>` | Individual SQL queries |
| `POST /api/metrics/summaries` | Claude tab summaries |
| `GET /api/metrics/status` | SQL engine health |

## Deploy bundle

```bash
bash scripts/build-flask-deploy-bundle.sh
bash scripts/test-flask-deploy.sh
```

Upload `SC-Manufacturing-Databricks-Deploy/` to Databricks → `./setup.sh` → deploy with `python app.py`.

## Environment variables

See `.env.example` for Supervisor, Claude, warehouse SQL, and cache settings.
