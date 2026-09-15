SC Manufacturing Console — Databricks Deploy Bundle
===================================================

Branch: (deploy bundle — pre-built dist folders)
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

IMPORTANT — DO NOT use Workspace UI "Import" for this bundle
  The UI often fails on package.json, .js, and some .sql files
  (you may see "Error importing package.json", env.js, config.js, etc.)
  while other files import OK. The app will NOT run with a partial upload.

RECOMMENDED options (in order):

  A) Databricks CLI sync (best for Workspace upload):
       cd SC-Manufacturing-Databricks-Deploy
       databricks auth login
       databricks sync . "/Workspace/Users/<your-email>/SC-Manufacturing" --full --overwrite

     Windows PowerShell:
       .\import-with-cli.ps1 -WorkspacePath "/Workspace/Users/<your-email>/SC-Manufacturing"

  B) Databricks Repo (best for ongoing updates):
       Workspace → Repos → Add Repo
       URL: <your Git repo URL>
       Branch: <your deploy branch>
       Path: /Repos/<you>/SC-Manufacturing
       Use folder: SC-Manufacturing-Databricks-Deploy

  C) Workspace UI zip import — only if CLI is blocked; re-import failed files via CLI

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
  - "[ERROR] Error building app" after npm install:
      This bundle ships pre-built client/dist and server/dist (no TypeScript/Vite
      sources). The build script is a no-op. If you still see this error, confirm
      package.json was uploaded (UI import often skips it) and re-sync via CLI.

  - "2 moderate severity vulnerabilities" during npm ci:
      These are npm audit warnings, not build failures. .npmrc sets audit-level=high.
      Run `npm audit` for details; do not block deploy on moderate findings.

  - "Error importing package.json / env.js / config.js" in UI:
      Delete the partial folder in Workspace, then use import-with-cli.ps1
      or `databricks sync` (see Step 1). UI import is not reliable for Node apps.

  - Missing UI: ensure client/dist/ was copied
  - SQL errors: check DATABRICKS_METRIC_VIEW matches your catalog.schema.view
  - 503 on load: run ./setup.sh (node_modules missing)

CRITICAL FILES (must all exist after upload)
--------------------------------------------
  package.json
  server/dist/server.js
  server/dist/lib/config.js
  server/dist/lib/env.js
  server/dist/lib/databricksSql.js
  config/queries/dashboard_dt_kpis.obo.sql
  config/queries/dashboard_filter_options.obo.sql
  client/dist/index.html
