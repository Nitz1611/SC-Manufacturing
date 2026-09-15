SC Manufacturing Console — Python Flask Deploy Bundle
======================================================

Branch: cursor/flask-react-parity-e63a
Runtime: Python 3.10+ (no Node at deploy time)

WHAT THIS FOLDER CONTAINS
-------------------------
  app.py / app.yaml              Flask entry + Databricks App config
  requirements.txt               Python dependencies
  py_server/                     Python API (analytics, summaries, preload)
  client/dist/                   Built React UI (required)
  config/queries/*.obo.sql       14 SQL query files (required)
  setup.sh                       pip install -r requirements.txt
  .env.example                   Environment variable reference

DO NOT COPY
-----------
  node_modules/   — not used (Python runtime only)
  .env            — use Databricks App secrets / env vars
  .git/           — not needed

STEP 1 — GET THE DEPLOY BUNDLE
--------------------------------
From the repo (branch cursor/flask-react-parity-e63a):

  git clone -b cursor/flask-react-parity-e63a https://github.com/Nitz1611/SC-Manufacturing.git
  cd SC-Manufacturing
  npm install
  npm run build:deploy:python
  npm run test:deploy:python

Deploy folder: SC-Manufacturing-Databricks-Deploy/

WINDOWS — use a SHORT path (NOT OneDrive):
  Expand/copy to C:\scm-deploy\ to avoid 0x80010135 path-too-long errors.

STEP 2 — COPY TO DATABRICKS WORKSPACE
------------------------------------
  databricks sync SC-Manufacturing-Databricks-Deploy "/Workspace/Users/<you>/SC-Manufacturing" --full --overwrite

STEP 3 — INSTALL DEPENDENCIES
-----------------------------
  cd /Workspace/Users/<you>/SC-Manufacturing
  ./setup.sh

STEP 4 — CONFIGURE ENVIRONMENT
------------------------------
Set in Databricks App → Environment variables:

  DATABRICKS_WAREHOUSE_ID
  DATABRICKS_HOST              (adb-xxxxx.azuredatabricks.net)
  DATABRICKS_PAT_TOKEN         (use Secret scope in production)
  DATABRICKS_METRIC_VIEW       (catalog.schema.pgt_plnt_prodtn_metric_view)

Optional AI summaries:
  SUMMARY_PROVIDER=claude
  CLAUDE_SERVING_ENDPOINT=databricks-claude-opus-4-6

STEP 5 — DEPLOY AS DATABRICKS APP
---------------------------------
  Command: python app.py  (from app.yaml)
  No npm install or npm start required.

STEP 6 — VERIFY
---------------
  https://<app-url>/api/status   → sql_ok: true (when credentials valid)
  https://<app-url>/             → Manufacturing Console UI

CRITICAL FILES (must all exist after upload)
--------------------------------------------
  app.py
  requirements.txt
  py_server/lib/analytics.py
  py_server/lib/metrics_transform.py
  config/queries/dashboard_dt_kpis.obo.sql
  client/dist/index.html
