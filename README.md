# SC Manufacturing Console — Unplanned Downtime (Pure Flask)

Branch: **`cursor/flask-pure-python-e63a`**

Same **Unplanned Downtime KPI dashboard** as the React branch — **no React, no npm at runtime**.

## Clone

```powershell
git clone -b cursor/flask-pure-python-e63a https://github.com/Nitz1611/SC-Manufacturing.git SC-Manufacturing-Flask
cd SC-Manufacturing-Flask
```

Use a short path (e.g. `C:\scm\`) — avoid deep OneDrive folders.

## Run (Windows)

```powershell
py -m pip install -r requirements.txt
copy .env.example .env
py app.py
```

Or with a virtual environment:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Open http://localhost:8000

## What's included

| Path | Purpose |
|------|---------|
| `app.py` | Flask entry |
| `py_server/` | Python API (same as React branch Node server) |
| `config/queries/` | MEASURE SQL queries |
| `templates/index.html` | Dashboard shell (same DOM as React AppLayout) |
| `static/js/console-engine.js` | Dashboard engine (bundled from React `engine.ts`) |
| `static/css/boot.css`, `console.css` | Same styles as React branch |
| `app.yaml` | Databricks App: `python app.py` |

## API (identical to React branch)

- `POST /api/console-data` — metrics bundle
- `POST /api/analytics/query/:key` — chart SQL
- `POST /api/summaries`, `/api/summaries/batch` — AI tab narratives
- `GET /api/status`, `/api/warmup`, `/api/job/:id`

## Rebuild UI from source (maintainers only)

If `client/src/lib/console/engine.ts` changes on the React branch, run once:

```bash
bash scripts/bundle-console.sh
```

Commit updated `static/js/console-engine.js`. End users never need npm.

## Databricks App

1. Copy this folder to Workspace (or connect Git repo on this branch)
2. Set env vars (`DATABRICKS_*`, `CLAUDE_SERVING_ENDPOINT`, etc.)
3. `pip install -r requirements.txt` → `python app.py`
