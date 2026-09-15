# SC Manufacturing Console — Pure Flask

Insights, Root Cause Analysis, and Ask Genie — **Python + Flask only** (no npm, no React).

Branch: `Sravani_Code`

## Run locally

```bash
pip install -r requirements.txt
cp .env.example .env   # edit with your Databricks credentials
python app.py
```

Open http://localhost:8000

## Project layout

```
app.py              Flask entry + API routes
supervisor.py       Databricks Supervisor / Genie client
cache.py            File-based cache (cache.json at runtime)
templates/
  index.html        Full UI (inline CSS/JS, Chart.js CDN)
requirements.txt
app.yaml            Databricks App config
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABRICKS_SERVER_HOSTNAME` | Workspace host |
| `DATABRICKS_PAT_TOKEN` | Personal access token |
| `SUPERVISOR_ENDPOINT_NAME` | Model serving endpoint name |
| `DATABRICKS_APP_PORT` | Port (default 8000) |
| `SUPERVISOR_QUERY_MODE` | `minimal`, `parallel`, or `split` |
| `INSIGHTS_REFRESH_INTERVAL_HOURS` | Cache TTL (default 24) |
| `GENIE_INSIGHTS_ON_STARTUP` | Pre-warm dashboard cache on boot |

## API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/` | GET | Dashboard UI |
| `/api/status` | GET | Health + cache info |
| `/api/dashboard` | POST | Insights data (async job) |
| `/api/rca` | POST | Root cause analysis (async job) |
| `/api/ask` | POST | Ask Genie Q&A (async job) |
| `/api/job/<id>` | GET | Poll background job |
| `/api/load-status` | GET | Loader progress |
| `/api/cache/clear` | POST | Clear cache |

## Databricks App

1. Sync this branch/folder to Workspace
2. Set env vars in the App UI (use secrets for PAT)
3. Deploy with `python app.py` (see `app.yaml`)

Verify: `https://<app-url>/api/status`
