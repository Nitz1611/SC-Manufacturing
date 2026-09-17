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

# ── Load .env FIRST before any getenv calls ───────────────────────
load_dotenv()

# Toggle: set USE_CLAUDE_DIRECT=true in .env to bypass MAS Supervisor
if os.getenv("USE_CLAUDE_DIRECT","false").lower() == "true":
    print("[app] Using Claude direct mode (bypassing MAS Supervisor)")
    from claude_supervisor import get_dashboard, ask_question, get_rca
else:
    print("[app] Using MAS Supervisor mode")
    from supervisor import get_dashboard, ask_question, get_rca
try:
    from views import get_all_view_data, validate_views, views_configured
    VIEWS_AVAILABLE = True
    if views_configured():
        threading.Thread(target=validate_views, daemon=True).start()
except Exception as _ve:
    print(f"[views] import failed: {_ve}")
    VIEWS_AVAILABLE = False
    def get_all_view_data(filters): return {}
    def validate_views(): return {}
    def views_configured(): return False
import cache as cache_store


def _supervisor_configured() -> bool:
    return bool(
        os.getenv("DATABRICKS_SERVER_HOSTNAME") or os.getenv("DATABRICKS_HOST")
    ) and bool(os.getenv("DATABRICKS_PAT_TOKEN")) and bool(os.getenv("SUPERVISOR_ENDPOINT_NAME"))


def _load_dashboard_data(filters: dict) -> dict:
    """Supervisor first; fall back to direct SQL views when configured."""
    errors = []
    if _supervisor_configured():
        try:
            return get_dashboard(filters)
        except Exception as e:
            errors.append(f"Supervisor: {e}")
            print(f"[dashboard] Supervisor failed: {e}")
    elif os.getenv("USE_CLAUDE_DIRECT", "false").lower() != "true":
        errors.append(
            "Supervisor not configured — set SUPERVISOR_ENDPOINT_NAME in .env "
            "(or USE_CLAUDE_DIRECT=true, or configure DATABRICKS_WAREHOUSE_ID for SQL fallback)"
        )

    if VIEWS_AVAILABLE and views_configured():
        try:
            data = get_all_view_data(filters)
            if data:
                data["_source"] = "views"
                return data
        except Exception as e:
            errors.append(f"Views: {e}")
            print(f"[dashboard] Views fallback failed: {e}")

    if errors:
        raise RuntimeError("; ".join(errors))
    raise RuntimeError("No data source configured — check sravani-console/.env.example")

PORT    = int(os.getenv("DATABRICKS_APP_PORT", 8000))
PREWARM = os.getenv("GENIE_INSIGHTS_ON_STARTUP", "true").lower() == "true"
REFRESH_MINUTES = int(os.getenv("INSIGHTS_REFRESH_INTERVAL_MINUTES", "30"))


def _background_refresh_loop():
    """Refresh dashboard cache every N minutes so users always get instant data."""
    import time as _t
    default_filters = {}
    key = json.dumps(default_filters, sort_keys=True)
    while True:
        _t.sleep(REFRESH_MINUTES * 60)
        with _jobs_lock:
            already = any(
                j["status"] == "running" and j.get("filter_key") == key
                for j in _jobs.values()
            )
        if already:
            print(f"[auto-refresh] Job running — skipping")
            continue
        print(f"[auto-refresh] Refreshing cache (interval={REFRESH_MINUTES}m)…")
        jid = _new_job()
        with _jobs_lock:
            _jobs[jid]["filter_key"] = key
        threading.Thread(
            target=_run_dashboard_job,
            args=(jid, default_filters, key),
            daemon=True,
        ).start()

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
        print(f"[job {jid[:8]}] Loading dashboard data…")
        data = _load_dashboard_data(filters)
        cache_store.set(cache_key, data)
        _finish_job(jid, data)
        src = data.get("_source", "supervisor")
        print(f"[job {jid[:8]}] Done ({src}) — {len(data.get('key_insights',[]))} insights")
    except Exception as e:
        _fail_job(jid, str(e))
        print(f"[job {jid[:8]}] Failed: {e}")


# ── GET /api/status ───────────────────────────────────────────────
@app.route("/api/status")
def status():
    # Check if we have cached dashboard data to serve immediately
    filters  = request.args.to_dict() or {}
    key      = json.dumps(filters, sort_keys=True)
    cached   = cache_store.get(key)
    # Also try empty filter key (most common)
    if not cached:
        cached = cache_store.get("{}")
    if not cached:
        cached = cache_store.get("")
    return jsonify({
        "ok":          True,
        "supervisor":  os.getenv("SUPERVISOR_ENDPOINT_NAME",   "NOT SET"),
        "supervisor_ok": _supervisor_configured(),
        "views_ok":    VIEWS_AVAILABLE and views_configured(),
        "hostname":    os.getenv("DATABRICKS_SERVER_HOSTNAME", "NOT SET"),
        "pat_set":     bool(os.getenv("DATABRICKS_PAT_TOKEN")),
        "port":        PORT,
        "cache":       cache_store.info(),
        "active_jobs": len([j for j in _jobs.values() if j["status"] == "running"]),
        "cache_hit":   bool(cached),
        "cached_data": cached,
    })



# ── GET /api/load-status — loader polls this for step progress ────
_load_status = {"state": "idle", "step": 0, "message": ""}

@app.route("/api/load-status")
def load_status():
    all_jobs = list(_jobs.values())
    running = [j for j in all_jobs if j["status"] == "running"]
    done    = [j for j in all_jobs if j["status"] == "done"]
    error   = [j for j in all_jobs if j["status"] == "error"]

    if running:
        elapsed = int(time.time() - running[0].get("started", time.time()))
        step = 2 if elapsed < 30 else 3
        return jsonify({"state": "loading", "step": step,
                        "message": f"Querying Genie views… {elapsed}s elapsed"})
    if done:
        # Return step 3 only — browser job poller handles step 4 + hideLoader
        return jsonify({"state": "done", "step": 3, "message": "Ready"})
    if error:
        return jsonify({"state": "error", "step": 0, "message": error[0].get("error","")})
    return jsonify({"state": "idle", "step": 1, "message": ""})

# ── POST /api/dashboard ───────────────────────────────────────────

@app.route("/api/views", methods=["POST"])
def views_data():
    """Direct from Databricks views — fast, no Genie needed."""
    if not VIEWS_AVAILABLE or not views_configured():
        print("[views] SQL warehouse not configured — skipping direct queries")
        return jsonify({"status":"ok","data":{},"from_cache":False,"skipped":True})
    filters = request.get_json(silent=True) or {}
    cache_key = "views_" + json.dumps(filters, sort_keys=True)
    cached = cache_store.get(cache_key)
    if cached:
        print("[views] Cache HIT")
        return jsonify({"status":"ok","data":cached,"from_cache":True})
    try:
        data = get_all_view_data(filters)
        if data:
            cache_store.set(cache_key, data, ttl_hours=1)
        return jsonify({"status":"ok","data":data,"from_cache":False})
    except Exception as e:
        print(f"[views] Error: {e}")
        return jsonify({"status":"ok","data":{},"error":str(e)})


@app.route("/api/filters", methods=["GET"])
def get_filters():
    """Get distinct filter values directly from views — no Genie needed."""
    if not VIEWS_AVAILABLE or not views_configured():
        # Return empty — browser will use defaults
        return jsonify({"status":"ok","data":{"sites":[],"regions":[],"markets":[],"years":[]}})
    try:
        from views import _run_sql, _qualified
        sites_sql   = f"SELECT DISTINCT Site FROM {_qualified('pgt_plnt_prodtn_metric_view')} WHERE Site IS NOT NULL GROUP BY ALL ORDER BY Site LIMIT 100"
        regions_sql = f"SELECT DISTINCT Region FROM {_qualified('pgt_plnt_prodtn_metric_view')} WHERE Region IS NOT NULL GROUP BY ALL ORDER BY Region LIMIT 50"
        years_sql   = f"SELECT DISTINCT YEAR(`Production Date`) as yr FROM {_qualified('pgt_plnt_prodtn_metric_view')} WHERE `Production Date` IS NOT NULL GROUP BY ALL ORDER BY yr DESC LIMIT 5"
        sites   = [r.get("Site","")   for r in _run_sql(sites_sql)   if r.get("Site")]
        regions = [r.get("Region","") for r in _run_sql(regions_sql) if r.get("Region")]
        years   = [str(r.get("yr","")) for r in _run_sql(years_sql)  if r.get("yr")]
        return jsonify({"status":"ok","data":{"sites":sites,"regions":regions,"years":years}})
    except Exception as e:
        print(f"[filters] Error: {e}")
        return jsonify({"status":"ok","data":{"sites":[],"regions":[],"markets":[],"years":[]}})

@app.route("/api/dashboard", methods=["POST"])
def dashboard():
    body    = request.get_json(silent=True) or {}
    filters = body.get("filters", {})
    force   = body.get("force", False)
    key     = json.dumps(filters, sort_keys=True)

    if not force:
        # Try exact key first
        cached = cache_store.get(key)
        # Fall back to any cached dashboard data (pre-warm may have different key)
        if not cached:
            for fallback_key in ["{}", '{"period": "week"}', '']:
                cached = cache_store.get(fallback_key)
                if cached:
                    print(f"[server] Cache HIT (fallback key)")
                    break
        if cached:
            print(f"[server] Cache HIT — serving immediately")
            return jsonify({**cached, "_cached": True, "_job_id": None})

    # Reuse any running job (not just same filter key)
    with _jobs_lock:
        for jid_existing, job in _jobs.items():
            if job["status"] == "running":
                print(f"[server] Reusing running job {jid_existing[:8]}")
                return jsonify({"_job_id": jid_existing, "_cached": False, "status": "running"})

    # Start new job
    _cleanup_old_jobs()
    jid = _new_job()
    with _jobs_lock:
        _jobs[jid]["filter_key"] = key
    t = threading.Thread(target=_run_dashboard_job, args=(jid, filters, key), daemon=True)
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
            cache_store.set(key, data, ttl_hours=4)
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
    body = request.get_json(silent=True) or {}
    if body.get("rca_only"):
        # Clear only RCA entries
        import json as _json
        store = cache_store._load_file()
        store = {k:v for k,v in store.items() if not k.startswith("rca_")}
        cache_store._save_file(store)
        return jsonify({"ok": True, "cleared": "rca"})
    elif body.get("dashboard_only"):
        # Clear only dashboard entries (keep RCA)
        store = cache_store._load_file()
        store = {k:v for k,v in store.items() if k.startswith("rca_")}
        cache_store._save_file(store)
        return jsonify({"ok": True, "cleared": "dashboard"})
    else:
        # Clear everything
        cache_store.clear()
        return jsonify({"ok": True, "cleared": "all"})


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
    print(f"║  SQL views  : {'READY ✓' if VIEWS_AVAILABLE and views_configured() else 'NOT SET ⚠':<38}║")
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
        key = json.dumps({}, sort_keys=True)
        if cache_store.get(key):
            print("[startup] Cache valid — skipping pre-warm")
        else:
            print("[startup] Pre-warming in background thread…")
            jid = _new_job()
            with _jobs_lock:
                _jobs[jid]["filter_key"] = key
            t = threading.Thread(
                target=_run_dashboard_job,
                args=(jid, {}, key),
                daemon=True,
            )
            t.start()

    # Start background auto-refresh loop
    threading.Thread(target=_background_refresh_loop, daemon=True).start()
    print(f"[auto-refresh] Background refresh every {REFRESH_MINUTES}m started")

    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
