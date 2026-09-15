# SC Manufacturing — Version Strategy

Two maintained branches serve different architectures. **Neither replaces the other** without an explicit migration decision.

| Branch | Stack | Status |
|--------|-------|--------|
| `cursor/flask-legacy-e63a` | Flask + Supervisor/Genie | **Frozen legacy** — original functionality preserved |
| `cursor/react-frontend-migration-e63a` | React + Node + direct SQL | **Active** — current Manufacturing Console |

---

## Flask legacy (`cursor/flask-legacy-e63a`) — you are here

**Purpose:** Preserve the initial uploaded Flask app with zero regression.

| Feature | Status |
|---------|--------|
| Supervisor → Genie data loading | ✅ |
| Waste + Downtime + OEE KPIs | ✅ |
| Key Insights, Observations, Opportunities | ✅ |
| Waste / Downtime trend charts | ✅ |
| Root Cause Analysis tab | ✅ |
| Ask Genie chat | ✅ |
| Shift “Did I Win?” | ✅ |
| File cache (`cache.json`) | ✅ |

**Not on this branch:** React UI, direct SQL queries, Show In filter, heatmaps, Databricks Node deploy bundle.

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
