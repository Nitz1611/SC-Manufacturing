# Sravani Manufacturing Console (Theme Parity Sandbox)

This folder contains **Sravani's original Flask app** from the `Sravani_Code` branch, with **CSS-only reskinning** to match the PepsiCo Manufacturing Console look and feel.

## What changed (look & feel only)

| Changed | Untouched |
|---------|-----------|
| Inline styles moved to `static/css/sravani-theme.css` | `app.py`, `views.py`, `supervisor.py`, `claude_supervisor.py`, `cache.py` |
| Inter font + PepsiCo header/logo styling | All JavaScript (dashboard load, filters, sidebar, RCA, Ask Pep) |
| PepsiCo navy gradient header, card shadows, filter styling | All API routes (`/api/dashboard`, `/api/ask`, `/api/job/*`, etc.) |

## Local setup

```bash
# Option A — use this folder inside the repo
cd sravani-console
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Copy env template and fill in Databricks credentials
cp .env.example .env
# Required for AI insights: SUPERVISOR_ENDPOINT_NAME
# Required for KPI tiles (without Supervisor): DATABRICKS_WAREHOUSE_ID

python app.py
# Open http://localhost:8000
```

```bash
# Option B — separate local folder (recommended for side-by-side testing)
git clone https://github.com/Nitz1611/SC-Manufacturing.git SC-Manufacturing-Sravani
cd SC-Manufacturing-Sravani
git checkout cursor/sravani-theme-parity-e63a
cd sravani-console
# ... same venv + pip steps as above
```

## Compare with DT dashboard

Run both apps on different ports:

| App | Folder | Default port |
|-----|--------|--------------|
| Unplanned DT dashboard | repo root (`python app.py`) | 5000 |
| Sravani maintenance console | `sravani-console/` (`python app.py`) | 8000 |

Verify visually: header gradient, Inter typography, filter bar, KPI cards, and tab styling should match. Functionality (Genie/Supervisor calls, sidebar drill-down, alerts) should behave exactly as in Sravani's original code.

## Files

```
sravani-console/
├── app.py                 # Sravani Flask entry (unchanged logic)
├── views.py               # Databricks metric view SQL (unchanged)
├── supervisor.py          # MAS Supervisor integration (unchanged)
├── claude_supervisor.py   # Optional direct Claude mode (unchanged)
├── cache.py               # Dashboard cache (unchanged)
├── templates/index.html   # Same HTML/JS; external CSS + logo only
└── static/
    ├── css/sravani-theme.css   # PepsiCo theme mapping
    └── img/pepsico-logo.gif
```

## Next steps (after local sign-off)

1. Confirm all Sravani flows work with the new skin (load, filters, KPI sidebar, alerts, RCA modal, Ask Pep).
2. Merge themed template/CSS into the main Flask app navigation when ready.
3. Do **not** merge until visual QA passes — functionality must remain identical.
