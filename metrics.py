"""
metrics.py — structured KPI data for Manufacturing Console charts.

Queries pgt_plnt_prodtn_metric_view via Supervisor/Genie using Period, Week,
and Year (from STRT_DT). Falls back to cached dashboard data when Supervisor
is unavailable.
"""

from __future__ import annotations

import json
import os
import re
from copy import deepcopy

from dotenv import load_dotenv

import cache as cache_store
from supervisor import _call_supervisor, _parse, _sanitise

load_dotenv()

HOSTNAME = os.getenv("DATABRICKS_SERVER_HOSTNAME", "")
PAT = os.getenv("DATABRICKS_PAT_TOKEN", "")
ENDPOINT = os.getenv("SUPERVISOR_ENDPOINT_NAME", "")


def normalize_filters(filters: dict | None) -> dict:
    """Map UI slicer payload to Supervisor/Genie filter context."""
    f = dict(filters or {})
    out = {}

    timeframe = (f.get("timeframe") or f.get("period") or "Week").strip()
    tf_map = {
        "week": "week",
        "month": "month",
        "quarter": "quarter",
        "fy": "fiscal_year",
    }
    out["period"] = tf_map.get(timeframe.lower(), timeframe.lower())

    year = f.get("year")
    if year and str(year).lower() not in ("all", ""):
        out["year"] = str(year)

    site = f.get("site")
    if site and str(site).lower() not in ("all", ""):
        out["site"] = str(site)

    region = f.get("region")
    if isinstance(region, list) and region:
        out["region"] = ", ".join(region)
    elif region and str(region).lower() not in ("all", ""):
        out["region"] = str(region)

    market = f.get("market")
    if isinstance(market, list) and market:
        out["market"] = ", ".join(market)
    elif market and str(market).lower() not in ("all", ""):
        out["market"] = str(market)

    show_in = f.get("showIn")
    if show_in:
        out["show_in"] = str(show_in)

    return out


def _ctx(filters: dict) -> str:
    parts = [f"{k}={v}" for k, v in filters.items() if v]
    return ", ".join(parts) or "all sites, current week"


def _build_metrics_prompt(filters: dict) -> str:
    ctx = _ctx(filters)
    return (
        "You are a manufacturing analytics supervisor agent for a PGT/Frito-Lay plant.\n"
        f"Filters: {ctx}\n\n"
        "Query Genie view pgt_plnt_prodtn_metric_view using these time columns:\n"
        "  STRT_DT (date), Year=extract year from STRT_DT, Period column, Week column\n"
        "Use Site, Line, Department, RSN, RSN3, RSN4, SHIFT_KEY,\n"
        "Total_Unplanned_Downtime_Hours, Total_Unplanned_Downtime_Pct, STOPS.\n"
        "Also use pgt_waste_pct_composite_metric_view for Waste_Pct and "
        "pgt_plnt_effcncy_metric_view for OEE when available.\n\n"
        "Return ONLY valid JSON (no markdown) with this schema:\n"
        '{"meta":{"year":2026,"period":"P09","week":"2026P09W03","date_from":"","date_to":""},'
        '"periods":["P1","P2","P3","P4","P5","P6","P7","P8","P9","P10"],'
        '"weeks":["2026P01W01","2026P01W02"],'
        '"kpis":{"waste_pct":{"value":"X.X%","delta":"...","direction":"bad|good|warn"},'
        '"downtime_pct":{"value":"X.X%","delta":"...","direction":"bad|good|warn"},'
        '"oee":{"value":"XX.X%","delta":"...","direction":"bad|good|warn"},'
        '"stops":{"value":"XXX","delta":"...","direction":"bad|good|warn"}},'
        '"key_insights":[{"text":"max 120 chars","color":"red|blue|amber|green"}],'
        '"observations":["string"],'
        '"site_by_period":{"ABERDEEN":[0.0]},'
        '"category_by_period":{"Equipment":[0.0]},'
        '"line_by_period":{"BCP1":[0.0]},'
        '"reasons":[{"reason":"RSN name","hours":0.0,"pct":0.0}],'
        '"period_trend":[0.0],'
        '"dow_by_day_week":{"Sunday":{"2026P01W01":0.0}},'
        '"top_lines":{"LINE1":0.0},'
        '"top_sites_trend":{"ABERDEEN":[0.0]}}\n'
        "Use actual Period values from the view for periods[] and period_trend length.\n"
        "Use actual Week values from the view for weeks[] and dow_by_day_week keys.\n"
        "reasons: top 20 by Total_Unplanned_Downtime_Hours for the filtered scope.\n"
    )


def _supervisor_configured() -> bool:
    return bool(HOSTNAME and PAT and ENDPOINT)


def get_metrics(filters: dict | None = None) -> dict:
    """Fetch structured metrics from Genie via Supervisor."""
    norm = normalize_filters(filters)
    if not _supervisor_configured():
        print("[metrics] Supervisor not configured — using cache fallback")
        return metrics_from_cache(norm)

    prompt = _build_metrics_prompt(norm)
    print(f"[metrics] Querying Genie for filters={norm}")
    raw = _call_supervisor([{"role": "user", "content": prompt}])
    parsed = _parse(raw)
    if parsed.get("narrative") and "periods" not in parsed:
        print("[metrics] Supervisor returned narrative — falling back to cache merge")
        return merge_metrics(metrics_from_cache(norm), parsed)
    return sanitize_metrics(parsed, norm, source="live")


def metrics_from_cache(filters: dict | None = None) -> dict:
    """Build metrics payload from cached dashboard + sensible defaults."""
    norm = normalize_filters(filters or {})
    dash_key = json.dumps({"period": norm.get("period", "week")}, sort_keys=True)
    dashboard = cache_store.get(dash_key) or _read_cache_any(dash_key)

    if not dashboard:
        for entry in cache_store.info().get("entries", []):
            if entry.get("key", "").startswith("{"):
                dashboard = cache_store.get(entry["key"])
                if dashboard:
                    break

    if not dashboard:
        return sanitize_metrics(_default_metrics(), norm, source="demo")

    return sanitize_metrics(_transform_dashboard(dashboard), norm, source="cache")


def _read_cache_any(preferred_key: str):
    """Read cache entry even if TTL expired (for offline/demo validation)."""
    try:
        import json as _json
        path = cache_store.CACHE_FILE
        if not os.path.exists(path):
            return None
        with open(path, "r") as f:
            store = _json.load(f)
        entry = store.get(preferred_key)
        if entry:
            return entry.get("data")
        for key, entry in store.items():
            if key.startswith("{") and entry.get("data", {}).get("kpis"):
                return entry["data"]
    except Exception as e:
        print(f"[metrics] cache read failed: {e}")
    return None


def merge_metrics(base: dict, extra: dict) -> dict:
    out = deepcopy(base)
    for key in ("key_insights", "observations", "kpis"):
        if extra.get(key):
            out[key] = extra[key]
    if extra.get("narrative"):
        out.setdefault("observations", [])
        out["observations"] = [extra["narrative"][:240]] + out.get("observations", [])
    return out


def _default_periods():
    return [f"P{i}" for i in range(1, 11)]


def _default_weeks():
    return [
        "2026P01W01", "2026P01W02", "2026P01W03", "2026P01W04",
        "2026P02W01", "2026P02W02", "2026P02W03", "2026P02W04",
        "2026P03W01", "2026P03W02", "2026P03W03",
    ]


def _default_metrics() -> dict:
    periods = _default_periods()
    trend = [8.63, 8.15, 7.49, 8.85, 8.20, 7.95, 8.40, 7.80, 8.10, 7.65]
    return {
        "meta": {"year": 2026, "period": "P09", "week": "2026P03W02", "date_from": "", "date_to": ""},
        "periods": periods,
        "weeks": _default_weeks(),
        "kpis": {
            "waste_pct": {"value": "3.0%", "delta": "↑ 0.2pp vs prior week", "direction": "warn"},
            "downtime_pct": {"value": "6.2%", "delta": "↓ 0.03pp vs prior week", "direction": "good"},
            "oee": {"value": "N/A", "delta": "OEE metric not available", "direction": "warn"},
            "stops": {"value": "819", "delta": "↓ 2451 vs prior week", "direction": "good"},
        },
        "key_insights": [],
        "observations": [],
        "site_by_period": {},
        "category_by_period": {},
        "line_by_period": {},
        "reasons": [],
        "period_trend": trend,
        "dow_by_day_week": {},
        "top_lines": {},
        "top_sites_trend": {},
    }


def _transform_dashboard(dashboard: dict) -> dict:
    """Map legacy dashboard payload into console metrics schema."""
    periods = _default_periods()
    weeks = _default_weeks()
    dt_trend = dashboard.get("downtime_trend") or {}
    trend_vals = dt_trend.get("data") or []
    period_trend = trend_vals[: len(periods)]
    while len(period_trend) < len(periods):
        period_trend.append(period_trend[-1] if period_trend else 0.0)

    reasons = []
    for i, bullet in enumerate(dashboard.get("downtime_bullets") or []):
        text = bullet.get("text", "") if isinstance(bullet, dict) else str(bullet)
        hours_match = re.search(r"([\d,]+\.?\d*)\s*h", text, re.I)
        hours = float(hours_match.group(1).replace(",", "")) if hours_match else max(0, 500 - i * 40)
        pct = bullet.get("pct", 0) if isinstance(bullet, dict) else 0
        name = text.split(" caused")[0].split(" — ")[0][:80] or f"Reason {i + 1}"
        reasons.append({"reason": name, "hours": hours, "pct": float(pct or 0)})

    top_lines = {}
    for item in dashboard.get("line_contributions") or []:
        if isinstance(item, dict) and item.get("line"):
            top_lines[item["line"]] = float(item.get("pct") or 0)

    return {
        "meta": {
            "year": 2026,
            "period": "P09",
            "week": weeks[-3] if weeks else "",
            "date_from": "",
            "date_to": "",
        },
        "periods": periods,
        "weeks": weeks,
        "kpis": dashboard.get("kpis") or _default_metrics()["kpis"],
        "key_insights": dashboard.get("key_insights") or [],
        "observations": dashboard.get("observations") or [],
        "site_by_period": {},
        "category_by_period": {},
        "line_by_period": {},
        "reasons": reasons,
        "period_trend": period_trend,
        "dow_by_day_week": _shift_to_dow(dashboard.get("shift_comparison") or [], weeks),
        "top_lines": top_lines,
        "top_sites_trend": {},
    }


def _shift_to_dow(shift_comparison: list, weeks: list) -> dict:
    """Approximate DOW matrix from shift comparison for cache/demo mode."""
    days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    out = {}
    for di, day in enumerate(days):
        base = 10 + di * 0.8
        out[day] = {}
        for wi, week in enumerate(weeks):
            shift_factor = 1.0
            for sh in shift_comparison:
                if isinstance(sh, dict):
                    shift_factor += float(sh.get("hours") or 0) / 1000
            out[day][week] = round(base * shift_factor * (1 + wi * 0.02), 2)
    return out


def sanitize_metrics(data: dict, filters: dict, source: str = "live") -> dict:
    """Ensure required keys exist with safe types."""
    base = _default_metrics()
    out = deepcopy(base)
    out.update({k: v for k, v in (data or {}).items() if v is not None})

    out["meta"] = {
        **base["meta"],
        **(out.get("meta") or {}),
        "source": source,
        "filters": filters,
    }

    if not out.get("periods"):
        out["periods"] = base["periods"]
    if not out.get("weeks"):
        out["weeks"] = base["weeks"]

    if not out.get("period_trend"):
        out["period_trend"] = base["period_trend"]
    elif len(out["period_trend"]) != len(out["periods"]):
        pt = list(out["period_trend"])
        while len(pt) < len(out["periods"]):
            pt.append(pt[-1] if pt else 0.0)
        out["period_trend"] = pt[: len(out["periods"])]

    if not out.get("kpis"):
        out["kpis"] = base["kpis"]

    for key in ("site_by_period", "category_by_period", "line_by_period", "top_lines", "top_sites_trend", "dow_by_day_week"):
        out[key] = out.get(key) or {}

    out["reasons"] = out.get("reasons") or []
    out["key_insights"] = out.get("key_insights") or []
    out["observations"] = out.get("observations") or []

    return out
