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

Create a `.env` file in the repo root for live Databricks SQL (without these, the app uses local cache):

```
DATABRICKS_WAREHOUSE_ID=
DATABRICKS_CATALOG=main
DATABRICKS_HOST=
DATABRICKS_PAT_TOKEN=
INSIGHTS_REFRESH_INTERVAL_HOURS=24
```

## API endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/analytics/query/:queryKey` | Chart/KPI data (direct SQL) |
| `POST /api/summaries` | Tab-specific AI narratives |
| `POST /api/console-data` | Legacy UI data bundle |
| `GET /api/warmup` | Warehouse pre-warm |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.
