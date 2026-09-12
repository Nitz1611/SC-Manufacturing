"""
app.py — Manufacturing Console (Flask / Approach A)

Uses background thread for Supervisor calls so browser never times out.
Browser polls /api/job/<id> every 5s until result is ready.

Run:  python app.py
Open: http://localhost:8000
"""

import os, json, time, uuid, threading
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
from supervisor import get_dashboard, ask_question, get_rca
import cache as cache_store

load_dotenv()

PORT    = int(os.getenv("DATABRICKS_APP_PORT", 8000))
PREWARM = os.getenv("GENIE_INSIGHTS_ON_STARTUP", "true").lower() == "true"

app = Flask(__name__)

# ── Job store — holds background task results ─────────────────────
# { job_id: {"status": "running|done|error", "result": {...}, "error": ""} }
_jobs: dict = {}
_jobs_lock  = threading.Lock()


def _new_job() -> str:
    jid = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[jid] = {"status": "running", "result": None, "error": "", "started": time.time()}
    return jid


def _finish_job(jid: str, result: dict):
    with _jobs_lock:
        _jobs[jid] = {"status": "done", "result": result, "error": "", "started": _jobs[jid]["started"]}


def _fail_job(jid: str, error: str):
    with _jobs_lock:
        _jobs[jid] = {"status": "error", "result": None, "error": error, "started": _jobs[jid].get("started", 0)}


def _get_job(jid: str) -> dict:
    with _jobs_lock:
        return _jobs.get(jid, {})


def _cleanup_old_jobs():
    """Remove jobs older than 2 hours."""
    cutoff = time.time() - 7200
    with _jobs_lock:
        old = [k for k, v in _jobs.items() if v.get("started", 0) < cutoff]
        for k in old:
            del _jobs[k]


# ── Background worker ─────────────────────────────────────────────
def _run_dashboard_job(jid: str, filters: dict, cache_key: str):
    try:
        print(f"[job {jid[:8]}] Starting Supervisor call…")
        data = get_dashboard(filters)
        cache_store.set(cache_key, data)
        _finish_job(jid, data)
        print(f"[job {jid[:8]}] Done — {len(data.get('key_insights',[]))} insights")
    except Exception as e:
        _fail_job(jid, str(e))
        print(f"[job {jid[:8]}] Failed: {e}")


# ── GET /api/status ───────────────────────────────────────────────
@app.route("/api/status")
def status():
    return jsonify({
        "ok":        True,
        "supervisor": os.getenv("SUPERVISOR_ENDPOINT_NAME",   "NOT SET"),
        "hostname":   os.getenv("DATABRICKS_SERVER_HOSTNAME", "NOT SET"),
        "pat_set":    bool(os.getenv("DATABRICKS_PAT_TOKEN")),
        "port":       PORT,
        "cache":      cache_store.info(),
        "active_jobs": len([j for j in _jobs.values() if j["status"] == "running"]),
    })



# ── GET /api/load-status — loader polls this for step progress ────
_load_status = {"state": "idle", "step": 0, "message": ""}

@app.route("/api/load-status")
def load_status():
    active = [j for j in _jobs.values() if j["status"] == "running"]
    if active:
        elapsed = int(time.time() - active[0].get("started", time.time()))
        return jsonify({"state": "loading", "step": 2,
                        "message": f"Querying Genie… {elapsed}s"})
    done = [j for j in _jobs.values() if j["status"] == "done"]
    if done:
        return jsonify({"state": "done", "step": 4, "message": "Ready"})
    return jsonify({"state": "idle", "step": 0, "message": ""})

# ── POST /api/dashboard ───────────────────────────────────────────
@app.route("/api/dashboard", methods=["POST"])
def dashboard():
    body    = request.get_json(silent=True) or {}
    filters = body.get("filters", {})
    force   = body.get("force", False)
    key     = json.dumps(filters, sort_keys=True)

    # Return from cache immediately if fresh
    if not force:
        cached = cache_store.get(key)
        if cached:
            print(f"[server] Cache HIT")
            return jsonify({**cached, "_cached": True, "_job_id": None})

    # Start background job — return job_id immediately
    # Browser will poll /api/job/<id> until done
    _cleanup_old_jobs()
    jid = _new_job()
    t   = threading.Thread(target=_run_dashboard_job, args=(jid, filters, key), daemon=True)
    t.start()
    print(f"[server] Started background job {jid[:8]} for filters={filters}")

    return jsonify({"_job_id": jid, "_cached": False, "status": "running"})


# ── GET /api/job/<jid> — browser polls this ───────────────────────
@app.route("/api/job/<jid>")
def job_status(jid):
    job = _get_job(jid)
    if not job:
        return jsonify({"status": "not_found"}), 404

    elapsed = int(time.time() - job.get("started", time.time()))

    if job["status"] == "running":
        return jsonify({
            "status":  "running",
            "elapsed": elapsed,
            "message": f"Supervisor querying Genie views… ({elapsed}s elapsed)",
        })

    if job["status"] == "error":
        return jsonify({"status": "error", "error": job["error"], "elapsed": elapsed})

    # Done — return full result
    return jsonify({"status": "done", "result": job["result"], "elapsed": elapsed})



# ── POST /api/rca ─────────────────────────────────────────────────
@app.route("/api/rca", methods=["POST"])
def rca():
    body      = request.get_json(silent=True) or {}
    filters   = body.get("filters", {})
    force     = body.get("force", False)
    kpi_focus = body.get("kpi_focus", "auto")   # "auto" or specific KPI name
    key       = f"rca_{kpi_focus}_" + json.dumps(filters, sort_keys=True)

    if not force:
        cached = cache_store.get(key)
        if cached:
            return jsonify({**cached, "_cached": True, "_job_id": None})

    jid = _new_job()
    def _rca_job():
        try:
            data = get_rca(filters, kpi_focus)
            cache_store.set(key, data)
            _finish_job(jid, data)
            print(f"[rca {jid[:8]}] Done — issue: {data.get('issue','?')}")
        except Exception as e:
            _fail_job(jid, str(e))
            print(f"[rca {jid[:8]}] Error: {e}")
    threading.Thread(target=_rca_job, daemon=True).start()
    return jsonify({"_job_id": jid, "_cached": False, "status": "running"})

# ── POST /api/ask ─────────────────────────────────────────────────
@app.route("/api/ask", methods=["POST"])
def ask():
    body     = request.get_json(silent=True) or {}
    question = (body.get("question") or "").strip()
    filters  = body.get("filters", {})

    if not question:
        return jsonify({"error": "question required"}), 400

    # Ask also runs in background — returns job_id
    jid = _new_job()

    def _ask_job():
        try:
            answer = ask_question(question, filters)
            _finish_job(jid, {"narrative": answer, "question": question})
        except Exception as e:
            _fail_job(jid, str(e))

    threading.Thread(target=_ask_job, daemon=True).start()
    return jsonify({"_job_id": jid, "status": "running"})


# ── POST /api/cache/clear ─────────────────────────────────────────
@app.route("/api/cache/clear", methods=["POST"])
def cache_clear():
    cache_store.clear()
    return jsonify({"ok": True})


# ── GET / ─────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


# ── Start ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║  Manufacturing Console  —  Flask / Approach A        ║")
    print(f"║  http://localhost:{PORT}                              ║")
    print("╠══════════════════════════════════════════════════════╣")
    print(f"║  Supervisor : {os.getenv('SUPERVISOR_ENDPOINT_NAME','NOT SET'):<38}║")
    print(f"║  Hostname   : {os.getenv('DATABRICKS_SERVER_HOSTNAME','NOT SET'):<38}║")
    print(f"║  PAT        : {'SET ✓' if os.getenv('DATABRICKS_PAT_TOKEN') else 'NOT SET ⚠':<38}║")
    print(f"║  Mode       : {os.getenv('SUPERVISOR_QUERY_MODE','minimal'):<38}║")
    print(f"║  Cache TTL  : {os.getenv('INSIGHTS_REFRESH_INTERVAL_HOURS','24')+'h':<38}║")
    print("╚══════════════════════════════════════════════════════╝")

    cinfo = cache_store.info()
    if cinfo["entry_count"] > 0:
        print(f"\n[cache] {cinfo['entry_count']} cached entries from previous run")
        for e in cinfo["entries"]:
            s = "VALID" if not e["expired"] else "EXPIRED"
            print(f"[cache]   {s} — {e['age_min']}m old, expires in {e['expires_in']}m")
    else:
        print("\n[cache] No cache — will load from Supervisor on first request")
    print()

    if PREWARM:
        key = json.dumps({"period": "week"}, sort_keys=True)
        if cache_store.get(key):
            print("[startup] Cache valid — skipping pre-warm")
        else:
            print("[startup] Pre-warming in background thread…")
            jid = _new_job()
            t   = threading.Thread(
                target=_run_dashboard_job,
                args=(jid, {"period": "week"}, key),
                daemon=True,
            )
            t.start()

    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
