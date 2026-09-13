# SC Manufacturing Console

Unplanned downtime (DT %) analytics dashboard for PepsiCo manufacturing operations.

## Project structure

```
SC-Manufacturing/
├── client/                 # React UI (Manufacturing Console)
├── server/                 # Node.js API
├── config/queries/         # Named SQL queries (*.obo.sql)
├── shared/types/           # Shared TypeScript types
└── docs/ARCHITECTURE.md    # Architecture reference
```

## Prerequisites

- **Node.js LTS** (includes npm) — https://nodejs.org/

On Windows PowerShell, if `npm` is blocked:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## Run locally

```powershell
npm install
npm run dev
```

| Service | URL |
|---------|-----|
| Manufacturing Console UI | http://localhost:5173 |
| API server | http://localhost:8000 |

## Environment variables (optional)

Create a `.env` file in the repo root for live Databricks SQL:

```
DATABRICKS_WAREHOUSE_ID=your-warehouse-id
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_PAT_TOKEN=your-pat-token
DATABRICKS_CATALOG=your_catalog
DATABRICKS_SCHEMA=your_schema
# Or set the full view name:
# DATABRICKS_METRIC_VIEW=your_catalog.your_schema.pgt_plnt_prodtn_metric_view
```

When configured, the server queries **`pgt_plnt_prodtn_metric_view` directly** (no Supervisor).  
Check `/api/status` — `mode` should be `live-sql-metric-view` and UI status bar shows **"Live unplanned DT data from metric view"**.

## API endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/analytics/query/:queryKey` | Chart/KPI data (direct SQL) |
| `POST /api/summaries` | Tab-specific AI narratives |
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
