# SC Manufacturing Console

Unplanned downtime (DT %) analytics dashboard for PepsiCo manufacturing operations.

> **This branch (`cursor/flask-react-parity-e63a`)** runs the **exact same React UI and Node API** as the React branch, with a **Python Flask entry point** (`python app.py`).  
> Live data, filters, MEASURE() KPIs, heatmaps, and Claude summaries are identical — same `client/dist`, same `server/dist`, same SQL files.

See [docs/VERSIONS.md](docs/VERSIONS.md) for branch comparison.

## Project structure

```
SC-Manufacturing/
├── app.py                  # Flask entry (serves React UI + proxies to Node API)
├── app.yaml                # Databricks App config (python app.py)
├── requirements.txt        # Python deps for Flask entry
├── client/                 # React UI → built to client/dist
├── server/                 # Node.js API → built to server/dist
├── config/queries/         # Named SQL queries (*.obo.sql)
├── shared/types/           # Shared TypeScript types
└── docs/ARCHITECTURE.md    # Architecture reference
```

## Prerequisites

- **Node.js LTS** (includes npm) — build step only
- **Python 3.10+** with pip — runtime entry point

## Run locally (Flask parity mode)

```powershell
npm install
npm run build
pip install -r requirements.txt
python app.py
```

| Service | URL |
|---------|-----|
| Manufacturing Console UI | http://localhost:8000 |
| API (via Node engine) | http://localhost:8000/api/status |

Alternative — Node-only dev (same output):

```powershell
npm run dev
```

## Frontend stack

| Technology | Role |
|------------|------|
| React 18 | UI framework |
| Vite | Build tool |
| TypeScript | Client typing |
| Tailwind CSS v4 | Utility CSS |
| shadcn/ui | Radix-based components |
| React Router | Section / KPI tab routes |
| ECharts | Lazy-loaded chart component (`LazyEChart`) |

The dashboard mounts via `client/src/components/layout/AppLayout.tsx` and `client/src/lib/console/engine.ts`.

## Environment variables (optional)

Create a `.env` file in the repo root for live Databricks SQL and Claude AI summaries:

```
DATABRICKS_WAREHOUSE_ID=
DATABRICKS_HOST=adb-1234567890123456.7.azuredatabricks.net
DATABRICKS_PAT_TOKEN=
DATABRICKS_CATALOG=your_catalog
DATABRICKS_SCHEMA=your_schema

# AI summaries — Claude Opus 4.6 (default when Databricks credentials are set)
SUMMARY_PROVIDER=claude
CLAUDE_SERVING_ENDPOINT=databricks-claude-opus-4-6
```

**Important:** Replace `DATABRICKS_HOST` with your real workspace hostname from the Databricks URL bar — it looks like `adb-1234567890123456.7.azuredatabricks.net`, **not** `your-workspace.cloud.databricks.com` (that placeholder will cause `ENOTFOUND`).

When configured, the server queries **`pgt_plnt_prodtn_metric_view` directly** for charts and KPIs.  
AI tab summaries use **Claude Opus 4.6** via Databricks Model Serving (`SUMMARY_PROVIDER=claude`).

Optional — Supervisor Agent instead of Claude:

```
SUMMARY_PROVIDER=supervisor
SUPERVISOR_ENDPOINT_NAME=your-supervisor-endpoint-name
```

Check `/api/status` — `provider` should be `claude`, `sql_ok` should be `true`.  
Check `/api/summaries/status` — `connectivity.ok` should be `true`.

If `mode` is `sql-error`, open `/api/status` and read `sql_test.error` — update `DATABRICKS_METRIC_VIEW` in `.env` with the exact catalog.schema.view from Databricks.

The view has no `Year` column — year filtering uses `YEAR(\`Production Date\`)` by default. Column names match the gold semantic layer (`Unplanned Downtime %`, `Line Desc`, `Downtime Category`, etc.). Override via `.env` if needed — see `.env.example`.

## API endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/analytics/query/:queryKey` | Chart/KPI data (direct SQL) |
| `POST /api/summaries` | Tab-specific AI narrative (Supervisor Agent → Genie) |
| `POST /api/summaries/batch` | All KPI tab summaries — returns `_job_id`, poll `/api/job/:id` |
| `GET /api/job/:id` | Poll background Supervisor job |
| `POST /api/console-data` | Legacy UI data bundle |
| `GET /api/warmup` | Warehouse pre-warm |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

## Clean up local folders (Windows)

If you have nested `SC-Manufacturing\SC-Manufacturing` folders, leftover Flask files (`static/`, `supervisor_old.py`, …), or `/api/status` shows `env_file: null`, reset your machine to the clean repo layout:

```powershell
cd "C:\...\SC Manufacturing\SC-Manufacturing"
powershell -ExecutionPolicy Bypass -File .\scripts\clean-local.ps1
```

Review the dry-run output, then apply:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\clean-local.ps1 -Execute
npm install
npm run dev
```

**Keep a single repo root** — the folder that contains `package.json`, `client/`, `server/`, and `.env` together. Do not run `npm run dev` from a nested copy.
