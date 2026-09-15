SC Manufacturing Console — Databricks Deploy Bundle
===================================================

Branch: cursor/react-frontend-migration-e63a
Built: 2026-09-15

WHAT THIS FOLDER CONTAINS
-------------------------
  package.json / package-lock.json   Root npm workspace
  client/dist/                       Built React UI (required)
  server/dist/                       Compiled Node API (required)
  config/queries/*.obo.sql           14 SQL query files (required)
  app.yaml                           Databricks App config
  .env.example                       Environment variable reference
  setup.sh                           Run after copy: npm ci --omit=dev

DO NOT COPY
-----------
  node_modules/   — run setup.sh instead
  .env            — use Databricks App secrets / env vars
  .git/           — not needed

STEP 1 — COPY TO DATABRICKS WORKSPACE
------------------------------------
Target path example:
  /Workspace/Users/<your-email>/SC-Manufacturing

Options:
  A) Zip this entire folder → Import in Databricks Workspace UI
  B) Databricks CLI:
       databricks sync ./SC-Manufacturing-Databricks-Deploy \
         "/Workspace/Users/<your-email>/SC-Manufacturing"

STEP 2 — INSTALL DEPENDENCIES
-----------------------------
In a Databricks notebook terminal or shell on the copied folder:

  chmod +x setup.sh
  ./setup.sh

STEP 3 — CONFIGURE ENVIRONMENT
------------------------------
Set these in Databricks App → Environment variables (or copy .env.example to .env for testing only):

  DATABRICKS_WAREHOUSE_ID
  DATABRICKS_HOST              (adb-xxxxx.azuredatabricks.net)
  DATABRICKS_PAT_TOKEN         (use Secret scope in production)
  DATABRICKS_METRIC_VIEW       (catalog.schema.pgt_plnt_prodtn_metric_view)
  DATABRICKS_CATALOG
  DATABRICKS_SCHEMA

Optional AI summaries:
  SUMMARY_PROVIDER=claude
  CLAUDE_SERVING_ENDPOINT=databricks-claude-opus-4-6

STEP 4 — DEPLOY AS DATABRICKS APP
---------------------------------
  1. Compute → Apps → Create app
  2. Source: /Workspace/Users/<you>/SC-Manufacturing
  3. Command: npm start  (or use app.yaml)
  4. Deploy → open App URL

STEP 5 — VERIFY
---------------
  Open: https://<app-url>/api/status
  Expect: "sql_ok": true

  Open: https://<app-url>/  (Manufacturing Console UI)

TROUBLESHOOTING
---------------
  - Missing UI: ensure client/dist/ was copied
  - SQL errors: check DATABRICKS_METRIC_VIEW matches your catalog.schema.view
  - 503 on load: run ./setup.sh (node_modules missing)
