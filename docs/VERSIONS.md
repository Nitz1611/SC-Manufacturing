# SC Manufacturing — Version Strategy

Two maintained branches serve different architectures. **Neither replaces the other** without an explicit migration decision.

| Branch | Stack | Status |
|--------|-------|--------|
| `cursor/flask-legacy-e63a` | Original Flask Insights + RCA + Ask Genie | Legacy preserved |
| `cursor/react-frontend-migration-e63a` | React + Node (npm start) | Active React branch |
| `cursor/flask-react-parity-e63a` | **Flask entry + same React/Node build** | **Exact React parity via `python app.py`** |

---

## Flask React parity (`cursor/flask-react-parity-e63a`) — exact replica

**Purpose:** Run `python app.py` (or Databricks App with `app.yaml`) while using the **identical** React UI and Node API engine.

| Component | Source | Parity |
|-----------|--------|--------|
| UI | `client/dist` (same Vite build) | ✅ 100% |
| API logic | `server/dist` (same TypeScript compile) | ✅ 100% |
| SQL queries | `config/queries/*.obo.sql` | ✅ 100% |
| MEASURE() KPIs, filters, heatmaps | Node `analytics.ts` + `metricsTransform.ts` | ✅ 100% |
| Claude Opus summaries | Node `claudeSummary.ts` | ✅ 100% |

No functionality is reimplemented in Python — Flask only serves static files and proxies `/api/*` to the Node server on an internal port.

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
| Databricks App deploy bundle | ✅ |
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
| Current DT dashboard, filters, SQL accuracy, Databricks App | `cursor/react-frontend-migration-e63a` |
| Both in one deployment | Not supported — pick one stack per environment |

---

## Keeping functionality intact

1. **Flask changes** → commit only on `cursor/flask-legacy-e63a`
2. **React changes** → commit only on `cursor/react-frontend-migration-e63a`
3. **Do not merge** branches without a written parity checklist
4. Before release, run the smoke test on the React branch: `npm run build:deploy && npm run test:deploy`
