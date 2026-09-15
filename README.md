# SC Manufacturing Console — Pure Flask

Branch: **`cursor/flask-pure-python-e63a`**

Python + Flask only. No npm, no React, no Node.

## Clone

```powershell
git clone -b cursor/flask-pure-python-e63a https://github.com/Nitz1611/SC-Manufacturing.git SC-Manufacturing-Flask
cd SC-Manufacturing-Flask
```

Use a short path (e.g. `C:\scm\`) — not deep OneDrive folders.

## Files in this branch

```
app.py                  Flask entry + API routes
views.py                Direct SQL for KPI widgets
cache.py                File cache (cache.json created at runtime)
supervisor.py           MAS Supervisor / Genie
claude_supervisor.py    Claude direct mode (USE_CLAUDE_DIRECT=true)
templates/index.html    UI (Insights, RCA, Ask Genie)
requirements.txt
app.yaml                Databricks App config
.env.example
```

## Run

```powershell
pip install -r requirements.txt
copy .env.example .env
python app.py
```

Open http://localhost:8000

## Databricks App

1. Copy this folder to Workspace (or connect as a Git repo on this branch)
2. Set env vars in the App UI (PAT via secrets)
3. Deploy with `python app.py` (see `app.yaml`)

Verify: `https://<app-url>/api/status`

## Environment variables

See `.env.example` for `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_PAT_TOKEN`, `SUPERVISOR_ENDPOINT_NAME`, `DATABRICKS_HTTP_PATH`, etc.
