# SC Manufacturing Console — Flask Legacy

This branch preserves the **original Flask + Supervisor/Genie** application exactly as it existed before the React migration.

**Active development** (direct SQL, KPI Overview, filters, Databricks deploy bundle) lives on:

`cursor/react-frontend-migration-e63a`

See [docs/VERSIONS.md](docs/VERSIONS.md) for a full comparison.

---

## What this version does

| Area | Implementation |
|------|----------------|
| Server | Python Flask (`app.py`) |
| UI | Single Jinja template (`templates/index.html`) + Chart.js CDN |
| Data | Databricks **Supervisor Agent → Genie** (no direct SQL) |
| AI | All dashboard content from Supervisor prompts |
| Cache | `cache.py` + `cache.json` (24h TTL) |

### Dashboard sections (Insights tab)

- Key Insights cards
- Waste Insights bullets
- Downtime Insights bullets
- Line Downtime Contribution
- Shift Downtime Comparison
- Last Shift — “Did I Win?”
- Waste Trend chart
- Downtime Trend chart
- AI Observations
- Opportunities (action items)

### Other tabs

- **Root Cause Analysis** — KPI selector, root cause ranking, recommended actions
- **Ask Genie** — free-form Q&A via floating chat
- **Intel Brief** — nav stub

---

## Run locally

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:8000

### Required environment variables

```
DATABRICKS_HOST=adb-xxxxx.azuredatabricks.net
DATABRICKS_PAT_TOKEN=
SUPERVISOR_ENDPOINT_NAME=
DATABRICKS_APP_PORT=8000
```

Optional:

```
GENIE_INSIGHTS_ON_STARTUP=true
```

---

## API endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Dashboard UI |
| `/api/status` | GET | Supervisor config, cache info |
| `/api/dashboard` | POST | Start background Supervisor job |
| `/api/job/<id>` | GET | Poll job result |
| `/api/rca` | POST | Root Cause Analysis |
| `/api/ask` | POST | Ask Genie Q&A |
| `/api/cache/clear` | POST | Clear cache |

---

## File layout

```
app.py              Flask server
supervisor.py       Supervisor Agent client (Genie queries)
cache.py            File cache helper
templates/index.html   Full dashboard UI
requirements.txt    flask, python-dotenv, requests
```

---

## Deployment

Run as a Python app on Databricks or any host with Flask:

```bash
pip install -r requirements.txt
python app.py
```

This branch does **not** include the Node.js / React stack or `SC-Manufacturing-Databricks-Deploy/` bundle.

---

## Do not merge into React branch

These are **parallel product lines**:

- **This branch** — Supervisor/Genie all-in-one Flask dashboard (waste + downtime + RCA + Ask Genie)
- **React branch** — Direct SQL analytics, rich KPI filters, Databricks App deploy bundle

Choose the branch that matches your deployment target. Functionality is documented in `docs/VERSIONS.md` on both branches.
