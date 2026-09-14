# SC Manufacturing Console — Architecture

## Overview

The SC Manufacturing Console is a React + Node.js application for unplanned downtime analytics. Chart data is loaded via **named SQL queries** against `pgt_plnt_prodtn_metric_view`. AI tab summaries are generated separately via the **Supervisor Agent** (VR Dashboard pattern).

## Folder layout

| Path | Purpose |
|------|---------|
| `client/` | React 18 + Vite SPA — Manufacturing Console UI |
| `client/public/legacy/console.js` | KPI tabs, Focus Mode, slicers (preserved UI) |
| `client/src/hooks/` | `useAnalyticsQuery`, `useSummary` |
| `server/` | Express API — analytics, summaries, jobs |
| `config/queries/` | One `.obo.sql` file per dashboard query |
| `shared/types/` | TypeScript contracts |

## Data flow

```
Browser (Manufacturing Console UI)
    → POST /api/analytics/query/:queryKey
        → SQL Warehouse (live) OR cache.json (dev fallback)
    → POST /api/summaries/batch
        → Background Supervisor job (_job_id)
        → GET /api/job/:id (poll until done)
            → Supervisor MAS endpoint → Genie → metric view
        → Tab narratives cached 24h per filter key
```

Charts use **direct SQL**. AI summaries use **Supervisor → Genie** (not pre-loaded metrics JSON).

## AI summaries (VR pattern)

| Step | What happens |
|------|----------------|
| 1 | UI shows template insight text from SQL metrics (instant) |
| 2 | `POST /api/summaries/batch` starts parallel Supervisor calls (5 tabs) |
| 3 | Server returns `_job_id` immediately |
| 4 | UI polls `GET /api/job/:id` every 3s |
| 5 | Supervisor delegates to Genie; narratives replace template text |

Configure: `SUPERVISOR_ENDPOINT_NAME` + `DATABRICKS_HOST` + `DATABRICKS_PAT_TOKEN`

## SQL query catalog

| Query key | Used for |
|-----------|----------|
| `dashboard_dt_kpis` | KPI strip (DT %, hours, STOPS, OEE) |
| `dashboard_dt_period_trend` | Period trend charts |
| `dashboard_dt_site_by_period` | Site heatmaps |
| `dashboard_dt_category_by_period` | Category heatmaps |
| `dashboard_dt_line_by_period` | Line heatmaps |
| `dashboard_dt_reasons` | Reason table |
| `dashboard_dt_dow` | Day-of-week heatmap |
| `dashboard_dt_top_lines` | Top lines bar chart |
| `dashboard_dt_shift_comparison` | Shift comparison |
| `dashboard_filter_options` | Site slicer options |

## Local development

Without Databricks credentials, the server reads `cache.json` (auto-created on first run) for instant load.

## Future work

- Port KPI tab components from legacy JS to React
- Add Ask Pep floating chat panel (Supervisor → Genie, section 10.3 VR spec)
- Auth (OBO) and Databricks App deployment
