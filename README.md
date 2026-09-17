# SC Manufacturing Console — Flask Legacy

Original Flask dashboard with **Claude Opus 4.6** for AI narratives (default).  
Same UI, API routes, JSON schema, cache, and parallel question logic as before.

**Active React version:** `cursor/react-frontend-migration-e63a`  
**Feature comparison:** [docs/VERSIONS.md](docs/VERSIONS.md)

---

## What changed (AI backend only)

| Before | Now (default) |
|--------|----------------|
| Supervisor Agent → Genie for all data + insights | SQL warehouse context + **Claude Opus** for insights |
| Required `SUPERVISOR_ENDPOINT_NAME` | Requires `DATABRICKS_HOST`, `DATABRICKS_PAT_TOKEN`, `DATABRICKS_WAREHOUSE_ID`, `CLAUDE_SERVING_ENDPOINT` |

Set `AI_PROVIDER=supervisor` in `.env` to restore the original Supervisor Agent behaviour.

---

## Dashboard features (unchanged)

- Insights tab: KPIs, waste/downtime bullets, trends, shift comparison, observations, opportunities
- Root Cause Analysis tab
- Ask Genie chat
- Background jobs + `/api/job/<id>` polling
- File cache (`cache.json`, 24h TTL)

---

## Run locally

```bash
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Databricks credentials
python app.py
```

Open http://localhost:8000

Check http://localhost:8000/api/status — expect `"ai_provider": "claude"`.

---

## Environment variables

```env
DATABRICKS_HOST=adb-xxxxx.azuredatabricks.net
DATABRICKS_PAT_TOKEN=
DATABRICKS_WAREHOUSE_ID=

AI_PROVIDER=claude
CLAUDE_SERVING_ENDPOINT=databricks-claude-opus-4-6

PRODTN_VIEW=catalog.schema.pgt_plnt_prodtn_metric_view
WASTE_VIEW=catalog.schema.pgt_waste_pct_composite_metric_view
EVENT_VIEW=catalog.schema.pgt_plnt_prodtn_evnt_metric_view
EFFICIENCY_VIEW=catalog.schema.pgt_plnt_effcncy_metric_view

SUPERVISOR_QUERY_MODE=parallel
```

---

## API endpoints (unchanged)

| Endpoint | Purpose |
|----------|---------|
| `/` | Dashboard UI |
| `/api/status` | AI provider, SQL config, cache |
| `/api/dashboard` | Start background dashboard job |
| `/api/job/<id>` | Poll job result |
| `/api/rca` | Root Cause Analysis |
| `/api/ask` | Ask Genie Q&A |
| `/api/cache/clear` | Clear cache |

---

## Files

| File | Role |
|------|------|
| `app.py` | Flask server |
| `supervisor.py` | Dashboard orchestration (same prompts + JSON schema) |
| `claude_ai.py` | Databricks Opus invocations |
| `databricks_client.py` | SQL Statement API |
| `sql_context.py` | Warehouse data injected into Claude prompts |
| `cache.py` | File cache |
| `templates/index.html` | UI (unchanged) |
