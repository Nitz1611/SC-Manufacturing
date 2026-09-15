"""
views.py — Verified working SQL for Databricks Metric Views.

Confirmed syntax:
  MEASURE(column) with GROUP BY ALL
  Production Period = week number (1-13), highest = most recent
  No Period_Week, no STRT_DT, no snake_case columns
"""
import os, requests, concurrent.futures
from dotenv import load_dotenv
load_dotenv()

HOSTNAME     = os.getenv("DATABRICKS_SERVER_HOSTNAME","").replace("https://","").rstrip("/")
PAT          = os.getenv("DATABRICKS_PAT_TOKEN","")
HTTP_PATH    = os.getenv("DATABRICKS_HTTP_PATH","")
CATALOG      = os.getenv("DATABRICKS_CATALOG","")
SCHEMA       = os.getenv("DATABRICKS_SCHEMA","")
WAREHOUSE_ID = HTTP_PATH.split("/warehouses/")[-1].strip("/") if "/warehouses/" in HTTP_PATH else HTTP_PATH.split("/")[-1]
SQL_URL      = f"https://{HOSTNAME}/api/2.0/sql/statements"

def _qualified(view):
    if CATALOG and SCHEMA: return f"{CATALOG}.{SCHEMA}.{view}"
    if SCHEMA: return f"{SCHEMA}.{view}"
    return view

DT  = lambda: _qualified('pgt_plnt_prodtn_metric_view')
WST = lambda: _qualified('pgt_waste_pct_composite_metric_view')

def _run_sql(sql):
    if not WAREHOUSE_ID:
        print("[views] No warehouse ID"); return []
    try:
        import time
        resp = requests.post(SQL_URL,
            headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
            json={"warehouse_id": WAREHOUSE_ID, "statement": sql,
                  "wait_timeout": "50s", "on_wait_timeout": "CONTINUE", "format": "JSON_ARRAY"},
            timeout=55)
        resp.raise_for_status()
        data = resp.json()
        stmt_id = data.get("statement_id")
        for _ in range(120):
            state = data.get("status", {}).get("state", "")
            if state == "SUCCEEDED": break
            if state in ("FAILED", "CANCELED", "CLOSED"):
                print(f"[views] SQL FAILED: {data.get('status',{}).get('error',{}).get('message','')[:150]}")
                return []
            if state in ("PENDING", "RUNNING") and stmt_id:
                time.sleep(1)
                data = requests.get(f"{SQL_URL}/{stmt_id}",
                    headers={"Authorization": f"Bearer {PAT}"}, timeout=10).json()
            else: break
        if data.get("status",{}).get("state") != "SUCCEEDED":
            return []
        cols = [c["name"] for c in (data.get("manifest",{}).get("schema",{}).get("columns") or [])]
        rows = data.get("result",{}).get("data_array") or []
        return [dict(zip(cols, row)) for row in rows]
    except Exception as e:
        print(f"[views] exception: {e}"); return []

def _f(v):
    try: return float(v or 0)
    except: return 0.0


def get_kpis(filters: dict) -> dict:
    """
    Get current and prior period KPIs.
    Production Period is a week number — max = most recent (current), max-1 = prior.
    """

    # Step 1: find the two most recent period numbers
    periods = _run_sql(f"""
        SELECT DISTINCT `Production Period`
        FROM {DT()}
        GROUP BY ALL
        ORDER BY `Production Period` DESC
        LIMIT 2
    """)
    if not periods:
        return {"kpis": _empty_kpis(), "_extra": {}}

    curr_period  = str(periods[0].get("Production Period",""))
    prior_period = str(periods[1].get("Production Period","")) if len(periods) > 1 else None

    # Step 2: fetch current period DT metrics
    curr_dt = _run_sql(f"""
        SELECT
            MEASURE(`Unplanned Downtime %`)      AS dt_pct,
            MEASURE(STOPS)                        AS stops,
            MEASURE(`Scheduled Hours`)            AS sched_hrs,
            MEASURE(`Unplanned Downtime Hours`)   AS unplanned_hrs,
            MEASURE(`% Downtime`)                 AS total_dt_pct,
            MEASURE(`MTTR (Hours)`)               AS mttr,
            MEASURE(`MTBF (Hours)`)               AS mtbf
        FROM {DT()}
        WHERE `Production Period` = {curr_period}
        GROUP BY ALL
    """)

    # Step 3: fetch prior period for delta
    prior_dt = _run_sql(f"""
        SELECT MEASURE(`Unplanned Downtime %`) AS dt_pct, MEASURE(STOPS) AS stops
        FROM {DT()}
        WHERE `Production Period` = {prior_period}
        GROUP BY ALL
    """) if prior_period else []

    # Step 4: waste — use same period logic
    # Waste view has no Production Period — get overall current waste
    curr_wst = _run_sql(f"""
        SELECT
            MEASURE(`Waste Pct`)                          AS waste_pct,
            MEASURE(`Total Waste Lbs (All Types)`)         AS waste_lbs,
            MEASURE(`Produced Lbs`)                        AS prod_lbs,
            MEASURE(`Waste Cost`)                          AS waste_cost
        FROM {WST()}
        GROUP BY ALL
    """)
    prior_wst = []  # no time dimension in waste view for delta

    c  = curr_dt[0]  if curr_dt  else {}
    p  = prior_dt[0] if prior_dt else {}
    cw = curr_wst[0] if curr_wst else {}
    pw = prior_wst[0]if prior_wst else {}

    c_dt    = _f(c.get("dt_pct"))   * 100 if _f(c.get("dt_pct")) < 1 else _f(c.get("dt_pct"))
    p_dt    = _f(p.get("dt_pct"))   * 100 if _f(p.get("dt_pct")) < 1 else _f(p.get("dt_pct"))
    c_wst   = _f(cw.get("waste_pct"))* 100 if _f(cw.get("waste_pct")) < 1 else _f(cw.get("waste_pct"))
    p_wst   = _f(pw.get("waste_pct"))* 100 if _f(pw.get("waste_pct")) < 1 else _f(pw.get("waste_pct"))
    c_stops = _f(c.get("stops"))
    p_stops = _f(p.get("stops"))
    sched   = _f(c.get("sched_hrs"))
    unplnd  = _f(c.get("unplanned_hrs"))

    def _delta(c, p):
        if not c or not p: return "—"
        d = round(c - p, 1)
        return f"{'↑' if d>0 else '↓'} {abs(d)}pp vs prior period"

    def _dir(v, t, hb=True):
        if not v: return "warn"
        return ("bad" if v>t else "good") if hb else ("bad" if v<t else "good")

    print(f"[views] KPIs — DT={round(c_dt,1)}% Waste={round(c_wst,1)}% Stops={int(c_stops)} Period={curr_period}")

    total_dt = _f(c.get("total_dt_pct"))
    total_dt_str = f"{round(total_dt*100,2)}%" if total_dt and total_dt < 1 else (f"{round(total_dt,2)}%" if total_dt else "—")

    return {
        "kpis": {
            "downtime_pct": {"value": f"{round(c_dt,1)}%" if c_dt else "—", "delta": _delta(c_dt, p_dt), "direction": _dir(c_dt, 5)},
            "stops":        {"value": f"{int(c_stops):,}" if c_stops else "—", "delta": _delta(c_stops, p_stops), "direction": _dir(c_stops, 2000)},
            "waste_pct":    {"value": f"{round(c_wst,1)}%" if c_wst else "—", "delta": _delta(c_wst, p_wst), "direction": _dir(c_wst, 5)},
            "oee":          {"value": "—", "delta": "—", "direction": "warn"},
            "downtime_hrs": {"value": "—", "delta": "—", "direction": "warn"},
        },
        "_extra": {
            "scheduled_hours": f"{int(sched):,}" if sched else "—",
            "unplanned_hours": f"{int(unplnd):,}" if unplnd else "—",
            "dt_pct":          total_dt_str,
            "current_period":  curr_period,
            "prior_period":    prior_period or "—",
            "waste_lbs":       f"{int(_f(cw.get('waste_lbs'))):,}" if cw.get('waste_lbs') else "—",
            "waste_cost":      f"${int(_f(cw.get('waste_cost'))):,}" if cw.get('waste_cost') else "—",
            "mttr":            f"{round(_f(c.get('mttr')),1)}h" if c.get('mttr') else "—",
            "mtbf":            f"{round(_f(c.get('mtbf')),1)}h" if c.get('mtbf') else "—",
        }
    }


def get_trends(filters: dict) -> dict:
    """Last 5 periods for DT, last 6 for waste."""

    dt_rows = _run_sql(f"""
        SELECT
            `Production Period`                        AS period,
            MEASURE(`Unplanned Downtime Hours`)         AS dt_hours,
            MEASURE(`Unplanned Downtime %`) * 100       AS dt_pct
        FROM {DT()}
        GROUP BY ALL
        ORDER BY `Production Period` DESC
        LIMIT 5
    """)
    dt_rows = list(reversed(dt_rows))

    wst_rows = _run_sql(f"""
        SELECT
            DATE_TRUNC('month', `Production Date`)   AS period,
            MEASURE(`Waste Pct`) * 100                 AS waste_pct
        FROM {WST()}
        WHERE `Production Date` IS NOT NULL
        GROUP BY ALL
        ORDER BY period DESC
        LIMIT 6
    """)
    wst_rows = list(reversed(wst_rows))

    def _build(rows, val_col, n):
        if not rows: return {"labels":[],"data":[],"anomaly_week":"","anomaly_label":"","severity":"warn"}
        labels = [f"W{i+1}" for i in range(len(rows))]
        data   = [round(_f(r.get(val_col)), 2) for r in rows]
        if not data: return {"labels":[],"data":[],"anomaly_week":"","anomaly_label":"","severity":"warn"}
        rising = len(data) > 2 and data[-1] > data[0]
        proj   = round(data[-1] + (data[-1]-data[-2]), 1) if len(data) >= 2 else data[-1]
        sev    = "critical" if rising else "warn"
        return {"labels":labels,"data":data,"anomaly_week":"RISING TREND" if rising else "","anomaly_label":f"Next period projected {proj}","severity":sev}

    return {
        "downtime_trend": _build(dt_rows,  "dt_hours",  5),
        "waste_trend":    _build(wst_rows, "waste_pct", 6),
    }


def get_sites(filters: dict) -> dict:
    """Sites above national average for DT and waste."""

    dt_sites = _run_sql(f"""
        SELECT
            Site,
            MEASURE(`Unplanned Downtime %`) * 100   AS dt_pct,
            MEASURE(`Scheduled Hours`)               AS sched_hrs
        FROM {DT()}
        WHERE Site IS NOT NULL
        GROUP BY ALL
        ORDER BY dt_pct DESC
        LIMIT 20
    """)

    wst_sites = _run_sql(f"""
        SELECT
            Site,
            MEASURE(`Waste Pct`) * 100              AS waste_pct
        FROM {WST()}
        WHERE Site IS NOT NULL
        GROUP BY ALL
        ORDER BY waste_pct DESC
        LIMIT 20
    """)

    avg_dt  = round(sum(_f(r.get("dt_pct"))   for r in dt_sites) /max(len(dt_sites),1),  2) if dt_sites  else 0
    avg_wst = round(sum(_f(r.get("waste_pct")) for r in wst_sites)/max(len(wst_sites),1), 2) if wst_sites else 0

    return {
        "sites_at_risk": [
            {"site": r.get("Site","—"),
             "dt_pct": f"{round(_f(r.get('dt_pct')),1)}%",
             "above_avg": f"+{round(_f(r.get('dt_pct'))-avg_dt,1)}pp",
             "scheduled_hours": f"{int(_f(r.get('sched_hrs',0))):,}"}
            for r in dt_sites if _f(r.get("dt_pct")) > avg_dt
        ],
        "waste_sites": [
            {"site": r.get("Site","—"),
             "waste_pct": f"{round(_f(r.get('waste_pct')),1)}%",
             "above_avg": f"+{round(_f(r.get('waste_pct'))-avg_wst,1)}pp"}
            for r in wst_sites if _f(r.get("waste_pct")) > avg_wst
        ],
        "national_avg_dt":    f"{avg_dt}%",
        "national_avg_waste": f"{avg_wst}%",
    }


def get_line_breakdown(filters: dict) -> dict:
    """Top downtime reasons, lines, shifts and waste types."""

    rsn_rows = _run_sql(f"""
        SELECT `Reason Area` AS RSN, MEASURE(`Unplanned Downtime Hours`) AS dt_hours
        FROM {DT()}
        WHERE `Reason Area` IS NOT NULL AND `Reason Area` != ''
        GROUP BY ALL
        ORDER BY dt_hours DESC
        LIMIT 5
    """)

    line_rows = _run_sql(f"""
        SELECT `Line Desc` AS Line, MEASURE(`Unplanned Downtime Hours`) AS dt_hours
        FROM {DT()}
        WHERE `Line Desc` IS NOT NULL AND `Line Desc` != ''
        GROUP BY ALL
        ORDER BY dt_hours DESC
        LIMIT 5
    """)

    shift_rows = _run_sql(f"""
        SELECT Shift AS shift_name, MEASURE(`Unplanned Downtime Hours`) AS avg_dt_hours
        FROM {DT()}
        WHERE Shift IS NOT NULL
        GROUP BY ALL
        ORDER BY Shift
        LIMIT 3
    """)

    wtype_rows = _run_sql(f"""
        SELECT
            `Waste Type`                                  AS WST_TYP,
            MEASURE(`Total Waste Lbs (All Types)`)        AS waste_lbs
        FROM {WST()}
        WHERE `Waste Type` IS NOT NULL AND `Waste Type` != ''
        GROUP BY ALL
        ORDER BY waste_lbs DESC
        LIMIT 5
    """)

    total_rsn  = sum(_f(r.get("dt_hours"))  for r in rsn_rows)  or 1
    total_line = sum(_f(r.get("dt_hours"))  for r in line_rows) or 1
    total_wst  = sum(_f(r.get("waste_lbs")) for r in wtype_rows)or 1

    shift_colors = {"Shift A":"#3B6FD4","Shift B":"#E04444","Shift C":"#3B6FD4"}

    return {
        "downtime_bullets": [
            {"text": f"{r.get('RSN','—')} — {round(_f(r.get('dt_hours')),1)}h ({round(_f(r.get('dt_hours'))/total_rsn*100,1)}% of unplanned DT)",
             "pct": round(_f(r.get("dt_hours"))/total_rsn*100, 1)}
            for r in rsn_rows[:3]
        ],
        "line_contributions": [
            {"line": r.get("Line","—"),
             "pct": round(_f(r.get("dt_hours"))/total_line*100, 1),
             "color": "red" if i==0 else "gray"}
            for i,r in enumerate(line_rows[:4])
        ] + ([{"line":"Others","pct":round(max(0,100-sum(_f(r.get("dt_hours"))/total_line*100 for r in line_rows[:4])),1),"color":"gray"}] if line_rows else []),
        "shift_comparison": [
            {"shift": r.get("shift_name","—"),
             "hours": round(_f(r.get("avg_dt_hours")),2),
             "color": shift_colors.get(r.get("shift_name",""),"#9CA3AF")}
            for r in shift_rows
        ],
        "waste_bullets": [
            {"text": f"{r.get('WST_TYP','—')} — {round(_f(r.get('waste_lbs'))/total_wst*100,1)}% of waste lbs",
             "pct": round(_f(r.get("waste_lbs"))/total_wst*100, 1)}
            for r in wtype_rows[:3]
        ],
    }


def get_comments(filters: dict) -> list:
    site_f = f"AND Site = '{filters['site']}'" if filters.get("site") and filters["site"] not in ("All","all","") else ""
    return _run_sql(f"""
        SELECT `Comment Text`, Shift, `Production Period`
        FROM {DT()}
        WHERE `Comment Text` IS NOT NULL AND `Comment Text` != '' {site_f}
        GROUP BY ALL
        LIMIT 150
    """)


def get_all_view_data(filters: dict) -> dict:
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futures = {
            "kpis":   ex.submit(get_kpis,          filters),
            "trends": ex.submit(get_trends,         filters),
            "sites":  ex.submit(get_sites,          filters),
            "lines":  ex.submit(get_line_breakdown, filters),
        }
        result = {}
        for name, future in futures.items():
            try:    result[name] = future.result(timeout=90)
            except Exception as e: print(f"[views] {name} failed: {e}"); result[name] = {}

    merged = {}
    merged.update(result.get("kpis",   {}))
    merged.update(result.get("trends", {}))
    merged.update(result.get("sites",  {}))
    merged.update(result.get("lines",  {}))
    return merged


def _empty_kpis():
    empty = {"value":"—","delta":"—","direction":"warn"}
    return {k: empty.copy() for k in ["downtime_pct","stops","waste_pct","oee","downtime_hrs"]}


def validate_views() -> dict:
    views = ["pgt_plnt_prodtn_metric_view","pgt_waste_pct_composite_metric_view",
             "pgt_plnt_effcncy_metric_view","pgt_plnt_prodtn_evnt_metric_view"]
    results = {}
    for view in views:
        q = _qualified(view)
        rows = _run_sql(f"SELECT 1 FROM {q} LIMIT 1")
        status = "OK" if rows else "EMPTY"
        results[view] = status
        print(f"[views] {q} — {status}")
    return results
