"""
SC Manufacturing Console — Flask entry point (exact React parity)

Serves the same built React UI (client/dist) and the same Node API (server/dist).
All dashboard logic, SQL queries, MEASURE() rollups, filters, and Claude summaries
run through the identical Node server code — guaranteed output match with the React branch.

Run:
  npm run build          # once — builds client/dist + server/dist
  pip install -r requirements.txt
  python app.py

Open: http://localhost:8000
"""
from __future__ import annotations

import atexit
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, Response, request, send_from_directory

load_dotenv()

ROOT = Path(__file__).resolve().parent
CLIENT_DIST = ROOT / "client" / "dist"
SERVER_JS = ROOT / "server" / "dist" / "server" / "server.js"
PORT = int(os.getenv("PORT") or os.getenv("DATABRICKS_APP_PORT") or 8000)
NODE_PORT = int(os.getenv("NODE_INTERNAL_PORT") or (PORT + 1))
NODE_HOST = os.getenv("NODE_INTERNAL_HOST") or "127.0.0.1"
NODE_BASE = f"http://{NODE_HOST}:{NODE_PORT}"

_node_proc: subprocess.Popen | None = None
app = Flask(__name__, static_folder=None)


def _ensure_build() -> None:
    if CLIENT_DIST.joinpath("index.html").is_file() and SERVER_JS.is_file():
        return
    print("[flask] Missing build artifacts — run: npm install && npm run build", file=sys.stderr)
    sys.exit(1)


def _wait_for_node(timeout_s: float = 90.0) -> None:
    deadline = time.time() + timeout_s
    url = f"{NODE_BASE}/api/status"
    while time.time() < deadline:
        try:
            r = requests.get(url, timeout=3)
            if r.status_code == 200:
                print(f"[flask] Node API ready at {NODE_BASE}")
                return
        except requests.RequestException:
            pass
        if _node_proc and _node_proc.poll() is not None:
            raise RuntimeError(f"Node server exited early (code {_node_proc.returncode})")
        time.sleep(0.5)
    raise RuntimeError(f"Node API did not become ready within {timeout_s}s")


def _start_node() -> None:
    global _node_proc
    _ensure_build()
    env = os.environ.copy()
    env["PORT"] = str(NODE_PORT)
    env.setdefault("NODE_ENV", "production")
    cmd = ["node", str(SERVER_JS)]
    print(f"[flask] Starting Node API: {' '.join(cmd)} (PORT={NODE_PORT})")
    _node_proc = subprocess.Popen(
        cmd,
        cwd=str(ROOT),
        env=env,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    atexit.register(_stop_node)
    _wait_for_node()


def _stop_node() -> None:
    global _node_proc
    if not _node_proc or _node_proc.poll() is not None:
        return
    print("[flask] Stopping Node API…")
    _node_proc.send_signal(signal.SIGTERM)
    try:
        _node_proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        _node_proc.kill()


def _proxy_api(subpath: str) -> Response:
    url = f"{NODE_BASE}/api/{subpath}"
    headers = {
        k: v
        for k, v in request.headers
        if k.lower() not in ("host", "content-length", "connection")
    }
    try:
        upstream = requests.request(
            method=request.method,
            url=url,
            params=request.args,
            data=request.get_data(),
            headers=headers,
            cookies=request.cookies,
            allow_redirects=False,
            timeout=600,
        )
    except requests.RequestException as exc:
        return Response(f'{{"error":"API proxy failed: {exc}"}}', status=502, mimetype="application/json")

    excluded = {"content-encoding", "transfer-encoding", "connection", "content-length"}
    response_headers = [(k, v) for k, v in upstream.headers.items() if k.lower() not in excluded]
    return Response(upstream.content, status=upstream.status_code, headers=response_headers)


@app.route("/api/", defaults={"subpath": ""}, methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
@app.route("/api/<path:subpath>", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
def api_proxy(subpath: str):
    if request.method == "OPTIONS":
        return Response(status=204)
    return _proxy_api(subpath)


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def spa(path: str):
    if path.startswith("api/"):
        return _proxy_api(path[4:])
    target = CLIENT_DIST / path
    if path and target.is_file():
        return send_from_directory(CLIENT_DIST, path)
    return send_from_directory(CLIENT_DIST, "index.html")


if __name__ == "__main__":
    _start_node()
    print("")
    print("╔══════════════════════════════════════════════════════╗")
    print("║  SC Manufacturing Console (Flask + React parity)       ║")
    print(f"║  http://localhost:{PORT}                              ║")
    print("╠══════════════════════════════════════════════════════╣")
    print("║  UI         : client/dist (same React build)           ║")
    print("║  API        : server/dist (same Node logic)            ║")
    print(f"║  Node int.  : {NODE_BASE:<38}║")
    print("╚══════════════════════════════════════════════════════╝")
    print("")
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
