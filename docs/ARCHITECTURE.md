# SC Manufacturing Console — Architecture

## Overview

The SC Manufacturing Console is a **React 18 + Node.js** application for unplanned downtime analytics. Chart data is loaded via **named SQL queries** against `pgt_plnt_prodtn_metric_view`. AI tab summaries are generated separately via the **Supervisor Agent**.

## Frontend stack

| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| Vite | Dev server and production build |
| TypeScript | Type-safe client and server |
| Tailwind CSS v4 | Utility styling (alongside console theme CSS) |
| shadcn/ui (Radix) | Accessible UI primitives (`Button`, etc.) |
| React Router | URL routes for main sections and KPI tabs |
| ECharts (lazy) | `LazyEChart` component for new chart surfaces |
| Chart.js (engine) | Existing dashboard charts during incremental ECharts migration |

## Folder layout

| Path | Purpose |
|------|---------|
| `client/src/` | React app entry, layout, hooks |
| `client/src/lib/console/engine.ts` | Dashboard engine (metrics, filters, tables, charts) |
| `client/src/components/` | Layout shell, shadcn UI, lazy ECharts |
| `client/src/hooks/` | `useAnalyticsQuery`, `useSummary` |
| `server/` | Express API — analytics, summaries, jobs |
| `config/queries/` | One `.obo.sql` file per dashboard query |
| `shared/types/` | TypeScript contracts |

## Data flow

```
Browser (React Manufacturing Console)
    → POST /api/console-data (metrics bundle + preload cache)
    → POST /api/summaries/batch
        → Background Supervisor job (_job_id)
        → GET /api/job/:id (poll until done)
            → Supervisor MAS endpoint → Genie → metric view
        → Tab narratives cached 24h per filter key
```

Charts use **direct SQL**. AI summaries use **Supervisor → Genie** (not pre-loaded metrics JSON).

## AI summaries

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

- Migrate dashboard charts from Chart.js engine to lazy-loaded ECharts components
- Convert imperative engine tables to declarative React components
- Add Ask Pep floating chat panel (Supervisor → Genie)
- Auth (OBO) and Databricks App deployment
