"""
SC Manufacturing Console — Pure Flask (Unplanned Downtime KPI dashboard)

Same UI and API as the React branch: dashboard engine in static/js/console-engine.js,
Python API in py_server/. No React or npm at runtime.

Run:
  pip install -r requirements.txt
  python app.py

Open: http://localhost:8000
"""
from __future__ import annotations

import os
import threading
from pathlib import Path

from flask import Flask, render_template

from py_server.lib.analytics import (
    purge_non_sql_caches,
    verify_metric_view_access,
    warmup_default_metrics_async,
)
from py_server.lib.cache import purge_legacy_metrics_disk_cache
from py_server.lib.databricks_fetch import test_databricks_reachability
from py_server.lib.databricks_sql import sql_configured, warmup_warehouse
from py_server.lib.env import load_env, sql_env_status
from py_server.lib.preload import start_preload_scheduler
from py_server.lib.summary_provider import describe_summary_provider
from py_server.routes import register_routes

load_env()

ROOT = Path(__file__).resolve().parent
PORT = int(os.getenv("PORT") or os.getenv("DATABRICKS_APP_PORT") or 8000)

app = Flask(__name__, static_folder="static", static_url_path="/static")
register_routes(app)


def _startup_warmup() -> None:
    if sql_configured():
        purge_non_sql_caches()
        purge_legacy_metrics_disk_cache()
    if not sql_configured():
        return
    try:
        reach = test_databricks_reachability()
        if not reach.get("ok"):
            print(f"[startup] ✗ Databricks unreachable: {reach.get('error')}")
            return
        warmup_warehouse()
        test = verify_metric_view_access()
        if test.get("ok"):
            print(f"[startup] ✓ metric view OK ({test.get('row_count', 0)} rows)")
            warmup_default_metrics_async()
            if (os.getenv("PRELOAD_ENABLED") or "false").lower() == "true":
                start_preload_scheduler()
            else:
                print("[startup] default FY 2026 warmup started in background")
        else:
            print(f"[startup] ✗ metric view check failed: {test.get('error')}")
    except Exception as exc:
        print(f"[startup] warmup failed: {exc}")


def _print_banner() -> None:
    mode = "Live SQL (metric view)     " if sql_configured() else "Demo fallback (no .env SQL)"
    summary_info = describe_summary_provider()
    sum_mode = (
        "Template summaries (no AI)      "
        if summary_info.get("provider") == "template"
        else f"{summary_info.get('label', 'AI')} summaries           "
    )
    env = sql_env_status()
    print("")
    print("╔══════════════════════════════════════════════════════╗")
    print("║  SC Manufacturing Console (Flask — DT KPI)           ║")
    print(f"║  http://localhost:{PORT}                              ║")
    print("╠══════════════════════════════════════════════════════╣")
    print(f"║  Mode       : {mode[:38]:<38}║")
    print(f"║  Summaries  : {sum_mode[:38]:<38}║")
    print("║  UI         : templates/index.html + static/          ║")
    print("║  API        : py_server/ (/api/*)                    ║")
    if env.get("env_file"):
        print(f"║  .env       : {env['env_file'][-38:]:<38}║")
    print("╚══════════════════════════════════════════════════════╝")
    print("")


@app.route("/")
def index():
    return render_template("index.html")


if __name__ == "__main__":
    _print_banner()
    threading.Thread(target=_startup_warmup, daemon=True).start()
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
