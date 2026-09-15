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

STEP 1 — GET THE DEPLOY BUNDLE
--------------------------------
Option A — Clone repo and create ZIP locally (RECOMMENDED for private GitHub repos):

  git clone -b cursor/react-frontend-migration-e63a https://github.com/Nitz1611/SC-Manufacturing.git
  cd SC-Manufacturing
  .\scripts\create-deploy-zip.ps1
  Expand-Archive scm-deploy.zip -DestinationPath C:\scm -Force
  cd C:\scm\scm-deploy

  Expected ZIP size: about 250–300 KB. If you see ~17 KB, that file is NOT a valid ZIP
  (usually an HTML login/error page from GitHub — common with private repos).

  Extract to a SHORT path (NOT OneDrive):
    Expand-Archive scm-deploy.zip -DestinationPath C:\scm -Force
    cd C:\scm\scm-deploy

WINDOWS — Error 0x80010135 "Path too long"
------------------------------------------
  Do NOT extract or copy under OneDrive or deep nested project folders.
  Use a short local path instead:

    cd SC-Manufacturing\SC-Manufacturing-Databricks-Deploy
    .\prepare-short-path.ps1

  This copies everything to C:\scm-deploy\ (short path). Deploy from there.

  Or enable long paths (Windows 10/11, admin PowerShell once):
    New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
      -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force

Option B — Use the folder directly (no ZIP needed):

  git clone -b cursor/react-frontend-migration-e63a https://github.com/Nitz1611/SC-Manufacturing.git
  cd SC-Manufacturing\SC-Manufacturing-Databricks-Deploy
  .\verify-upload.ps1
  .\import-with-cli.ps1 -WorkspacePath "/Workspace/Users/<your-email>/SC-Manufacturing"

Option C — GitHub raw link (works only if you are logged in and repo access allows it):

  https://raw.githubusercontent.com/Nitz1611/SC-Manufacturing/cursor/react-frontend-migration-e63a/SC-Manufacturing-Databricks-Deploy.zip

STEP 2 — COPY TO DATABRICKS WORKSPACE
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

STEP 2 — TEST LOCALLY (same steps Databricks runs)
-------------------------------------------------
From the repo root (development machine):

  npm run build:deploy    # build source + refresh this deploy folder
  npm run test:deploy     # npm install → npm run build → npm start smoke test

Windows PowerShell:

  npm run build
  .\scripts\build-deploy-bundle.ps1
  cd SC-Manufacturing-Databricks-Deploy
  npm install
  npm run build
  npm start

If test:deploy passes locally, upload THIS folder to Databricks — do not upload the full repo root
(unless you include client/src and fix all TypeScript build deps).

STEP 3 — INSTALL DEPENDENCIES IN DATABRICKS
-------------------------------------------
In a Databricks notebook terminal or shell on the copied folder:

  chmod +x setup.sh
  ./setup.sh

STEP 4 — CONFIGURE ENVIRONMENT
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

STEP 5 — DEPLOY AS DATABRICKS APP
---------------------------------
  1. Compute → Apps → Create app
  2. Source: /Workspace/Users/<you>/SC-Manufacturing
  3. Command: npm start  (or use app.yaml)
  4. Deploy → open App URL

STEP 6 — VERIFY
---------------
  Open: https://<app-url>/api/status
  Expect: "sql_ok": true

  Open: https://<app-url>/  (Manufacturing Console UI)

TROUBLESHOOTING
---------------
  - "[ERROR] Error building app" after npm install:
      Databricks runs npm run build when package.json defines a "build" script.
      This bundle has NO root build script (pre-built dist only). If you see this error,
      your upload is stale or partial — open Workspace package.json and check:
        WRONG: "build": "npm run build --workspace=client && ..."
        RIGHT: no "build" key at the root
      Run verify-upload.ps1 locally, then re-sync with import-with-cli.ps1.

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
  server/dist/server/server.js
  server/dist/server/lib/config.js
  server/dist/server/lib/env.js
  server/dist/server/lib/databricksSql.js
  config/queries/dashboard_dt_kpis.obo.sql
  config/queries/dashboard_filter_options.obo.sql
  client/dist/index.html
