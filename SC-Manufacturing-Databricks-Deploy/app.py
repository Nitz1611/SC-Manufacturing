"""
SC Manufacturing Console — Pure Python + Flask (React UI parity)

Serves the built React UI (client/dist) and Python API (py_server/).
All dashboard logic, SQL queries, MEASURE() rollups, filters, and Claude summaries
run in Python — no Node runtime required at deploy time.

Run:
  npm run build          # once — builds client/dist (UI only)
  pip install -r requirements.txt
  python app.py

Open: http://localhost:8000
"""
from __future__ import annotations

import os
import sys
import threading
from pathlib import Path

from flask import Flask, send_from_directory

from py_server.lib.analytics import verify_metric_view_access
from py_server.lib.databricks_fetch import test_databricks_reachability
from py_server.lib.databricks_sql import sql_configured, warmup_warehouse
from py_server.lib.env import load_env, sql_env_status
from py_server.lib.preload import start_preload_scheduler
from py_server.lib.summary_provider import describe_summary_provider
from py_server.routes import register_routes

load_env()

ROOT = Path(__file__).resolve().parent
CLIENT_DIST = ROOT / "client" / "dist"
PORT = int(os.getenv("PORT") or os.getenv("DATABRICKS_APP_PORT") or 8000)

app = Flask(__name__, static_folder=None)
register_routes(app)


def _ensure_client_build() -> None:
    if CLIENT_DIST.joinpath("index.html").is_file():
        return
    print("[flask] Missing client/dist — run: npm install && npm run build", file=sys.stderr)
    sys.exit(1)


def _startup_warmup() -> None:
    if not sql_configured():
        return
    try:
        reach = test_databricks_reachability()
        if not reach.get("ok"):
            print(f"[startup] ✗ Databricks unreachable: {reach.get('error')}")
            if reach.get("proxy"):
                print(f"[startup]   proxy={reach.get('proxy')}")
            return
        warmup_warehouse()
        test = verify_metric_view_access()
        if test.get("ok"):
            print(f"[startup] ✓ metric view OK ({test.get('row_count', 0)} rows)")
            start_preload_scheduler()
        else:
            print(f"[startup] ✗ metric view check failed: {test.get('error')}")
    except Exception as exc:
        print(f"[startup] warmup failed: {exc}")


def _print_banner() -> None:
    mode = "Live SQL (metric view)     " if sql_configured() else "Demo fallback (no .env SQL)"
    summary_info = describe_summary_provider()
    if summary_info.get("provider") == "template":
        sum_mode = "Template summaries (no AI endpoint) "
    else:
        sum_mode = f"{summary_info.get('label', 'AI')} (AI summaries) "
    env = sql_env_status()

    print("")
    print("╔══════════════════════════════════════════════════════╗")
    print("║  SC Manufacturing Console (Python + Flask)           ║")
    print(f"║  http://localhost:{PORT}                              ║")
    print("╠══════════════════════════════════════════════════════╣")
    print(f"║  Mode       : {mode[:38]:<38}║")
    print(f"║  Summaries  : {sum_mode[:38]:<38}║")
    if summary_info.get("provider") == "template" and summary_info.get("reason"):
        print(f"║  AI note    : {summary_info['reason'][:38]:<38}║")
    if env.get("env_file"):
        print(f"║  .env       : {env['env_file'][-38:]:<38}║")
    if env.get("missing"):
        print(f"║  Missing    : {', '.join(env['missing'])[:38]:<38}║")
    print("║  Analytics  : POST /api/analytics/query/:queryKey    ║")
    print("║  Summaries  : POST /api/summaries                    ║")
    print("║  Legacy     : POST /api/console-data                   ║")
    print("║  Preload    : GET  /api/preload/status                 ║")
    print("║  Warmup     : GET  /api/warmup                         ║")
    print("╚══════════════════════════════════════════════════════╝")
    print("")


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def spa(path: str):
    if path.startswith("api/"):
        return {"error": "Not found"}, 404
    target = CLIENT_DIST / path
    if path and target.is_file():
        return send_from_directory(CLIENT_DIST, path)
    index = CLIENT_DIST / "index.html"
    if index.is_file():
        return send_from_directory(CLIENT_DIST, "index.html")
    return (
        f"""<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;padding:40px">
        <h1>SC Manufacturing Console</h1>
        <p>Server is running on port {PORT}.</p>
        <p>Run <code>npm run build</code> to build client/dist.</p>
        <p><a href="/api/status">/api/status</a></p>
        </body></html>""",
        200,
        {"Content-Type": "text/html; charset=utf-8"},
    )


if __name__ == "__main__":
    _ensure_client_build()
    _print_banner()
    threading.Thread(target=_startup_warmup, daemon=True).start()
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
