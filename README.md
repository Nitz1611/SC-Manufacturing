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

Create a `.env` file in the repo root for live Databricks SQL:

```
DATABRICKS_WAREHOUSE_ID=your-warehouse-id
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_PAT_TOKEN=your-pat-token
DATABRICKS_CATALOG=your_catalog
DATABRICKS_SCHEMA=your_schema
# If TABLE_OR_VIEW_NOT_FOUND, set the exact path from Databricks (overrides catalog + schema):
# DATABRICKS_METRIC_VIEW=uc_prod_cgf_mdip_01.your_schema.pgt_plnt_prodtn_metric_view
```

When configured, the server queries **`pgt_plnt_prodtn_metric_view` directly** for charts and KPIs.  
AI tab summaries use the **Supervisor Agent** — Supervisor orchestrates Genie to query the metric view live:

```
SUPERVISOR_ENDPOINT_NAME=your-supervisor-endpoint-name
```

Summaries run as **background jobs**; the UI polls `/api/job/{id}` while Supervisor queries Genie.
If Supervisor is not configured, summaries fall back to template text from SQL metrics.

Check `/api/status` — `sql_ok` should be `true`, `summaries` should be `supervisor-agent`.

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
