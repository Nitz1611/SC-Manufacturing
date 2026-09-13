# SC Manufacturing Console — VR Architecture

This repository follows the **VR Dashboard development standards** (Databricks AppKit pattern) for data and AI, while preserving the **SC Manufacturing Console** look, feel, and KPI tab functionality.

## Project structure (VR-aligned)

```
SC-Manufacturing/
├── client/                 # React 18 + Vite + TypeScript SPA
│   └── src/
│       ├── hooks/          # useAnalyticsQuery, useSummary (VR pattern)
│       ├── legacy/         # Manufacturing Console UI (preserved during migration)
│       └── styles/         # console.css (unchanged visual design)
├── server/                 # Node.js + Express (AppKit-equivalent routes)
│   ├── routes/
│   │   ├── analytics.ts    # POST /api/analytics/query/:queryKey
│   │   └── summaries.ts    # POST /api/summaries, GET /api/warmup
│   └── lib/
├── config/queries/         # Named *.obo.sql files (direct SQL, not Genie)
├── shared/types/           # Shared TS types (dashboard.ts)
├── app.py                  # Legacy Flask (reference — use npm run dev)
└── Vr Dashboard.html       # VR architecture reference doc
```

## Architecture (data vs AI)

| Concern | VR pattern | SC Manufacturing endpoint |
|---------|------------|---------------------------|
| Chart / KPI / heatmap data | `useAnalyticsQuery("dashboard_dt_*")` | `POST /api/analytics/query/:queryKey` |
| Tab AI summaries | `useSummary(entityType)` | `POST /api/summaries` |
| Warehouse pre-warm | `GET /api/warmup` on app load | Same |
| Legacy UI bridge | — | `POST /api/console-data` (aggregates cache/SQL) |
| Ask / chat (future) | Supervisor MAS stream | Not migrated yet |

**Key rule:** Dashboard numbers come from **SQL Warehouse + named queries**, not Supervisor/Genie. Genie is reserved for natural-language Q&A only.

## Run locally (auth & deployment excluded)

```bash
npm install
npm run dev
```

- **Client:** http://localhost:5173 (Vite, proxies `/api` → server)
- **Server:** http://localhost:8000

Without `DATABRICKS_WAREHOUSE_ID`, the server serves **instant cache fallback** from `cache.json` (same data as legacy Flask).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABRICKS_WAREHOUSE_ID` | SQL Warehouse for live queries |
| `DATABRICKS_CATALOG` | Unity Catalog name in SQL files |
| `DATABRICKS_HOST` / `DATABRICKS_SERVER_HOSTNAME` | Workspace URL |
| `DATABRICKS_PAT_TOKEN` | SQL API auth (local dev) |
| `INSIGHTS_REFRESH_INTERVAL_HOURS` | Cache TTL (default 24) |
| `SUMMARY_CACHE_TTL_HOURS` | AI summary cache TTL |

## Migration status

| Layer | Status |
|-------|--------|
| VR folder structure | Done |
| Named SQL query catalog | Done |
| Analytics API (`/api/analytics/query/*`) | Done |
| Summaries API (`/api/summaries`) | Done |
| React hooks (`useAnalyticsQuery`, `useSummary`) | Done |
| Manufacturing UI (5 KPI tabs, Focus Mode, slicers) | Preserved via `legacy/console.js` |
| React component port (replace legacy JS) | Planned incremental |
| Auth (OBO) / Databricks App deploy | Out of scope for now |

## Query catalog

| Query key | Used for |
|-----------|----------|
| `dashboard_dt_kpis` | KPI strip |
| `dashboard_dt_period_trend` | Period trend charts |
| `dashboard_dt_site_by_period` | Site heatmaps |
| `dashboard_dt_category_by_period` | Category heatmaps |
| `dashboard_dt_line_by_period` | Line heatmaps |
| `dashboard_dt_reasons` | Reason table |
| `dashboard_dt_dow` | Day-of-week heatmap |
| `dashboard_dt_top_lines` | Top lines bar chart |
| `dashboard_dt_shift_comparison` | Shift comparison / DOW insights |
| `dashboard_filter_options` | Site slicer options |
