# SC Manufacturing — Version Strategy

Two maintained branches serve different architectures. **Neither replaces the other** without an explicit migration decision.

| Branch | Stack | Status |
|--------|-------|--------|
| `cursor/flask-legacy-e63a` | Original Flask Insights + RCA + Ask Genie | Legacy preserved |
| `cursor/react-frontend-migration-e63a` | React + Node (npm start) | Active React branch |
| `cursor/flask-react-parity-e63a` | **React UI + Python Flask API** | **Databricks App target — no Node runtime** |

---

## Flask React parity (`cursor/flask-react-parity-e63a`) — Python + Flask

**Purpose:** Run `python app.py` (or Databricks App with `app.yaml`) with the **same React UI** and **Python-ported API** in `py_server/`.

| Component | Source | Parity |
|-----------|--------|--------|
| UI | `client/dist` (same Vite build) | ✅ 100% |
| API logic | `py_server/` (ported from `server/`) | ✅ Same routes & transforms |
| SQL queries | `config/queries/*.obo.sql` | ✅ 100% |
| MEASURE() KPIs, filters, heatmaps | `py_server/lib/analytics.py` + `metrics_transform.py` | ✅ Ported |
| Claude Opus summaries | `py_server/lib/claude_summary.py` | ✅ Ported |
| Databricks App runtime | `python app.py` + `requirements.txt` | ✅ No Node required |

Node is only needed to **build** `client/dist` during development. The deploy bundle (`npm run build:deploy:python`) ships pre-built UI + Python server.

---

## React / Node (`cursor/react-frontend-migration-e63a`)

**Purpose:** Current production target — unplanned downtime analytics with direct SQL.

| Feature | Status |
|---------|--------|
| KPI Overview (5 sub-tabs) | ✅ |
| Show In: Millions / Thousands / Actual / Percentage | ✅ |
| Filters: Timeframe, Year, Site, Region | ✅ |
| Heatmaps (site, category, line, DOW×shift) | ✅ |
| MEASURE() SQL KPIs (correct UC rollup) | ✅ |
| Per-tab AI summaries (Claude / Supervisor) | ✅ |
| Background preload scheduler | ✅ |
| Databricks App deploy bundle | ✅ (Node) |
| Demo mode without SQL | ✅ |

**Placeholders (not yet ported from Flask):**

| Feature | Status |
|---------|--------|
| Intel Brief tab | Placeholder |
| Insights tab (Flask-style combined view) | Placeholder — content in KPI Overview |
| Root Cause Analysis tab | Placeholder UI |
| Ask Genie free-form chat | Not implemented |
| Waste analytics | Intentionally de-scoped (DT-only focus) |

---

## Choosing a branch

| Need | Use |
|------|-----|
| Original Flask app, RCA, Ask Genie, waste metrics | `cursor/flask-legacy-e63a` |
| Current DT dashboard, filters, SQL accuracy, Databricks App (Node) | `cursor/react-frontend-migration-e63a` |
| Same dashboard on Databricks App with **Python + Flask only** | `cursor/flask-react-parity-e63a` |
| Both in one deployment | Not supported — pick one stack per environment |

---

## Keeping functionality intact

1. **Flask changes** → commit only on `cursor/flask-legacy-e63a`
2. **React changes** → commit only on `cursor/react-frontend-migration-e63a`
3. **Python parity changes** → commit on `cursor/flask-react-parity-e63a`
4. **Do not merge** branches without a written parity checklist
5. Before release on React branch: `npm run build:deploy && npm run test:deploy`
6. Before release on Python parity branch: `npm run build:deploy:python && npm run test:deploy:python`
