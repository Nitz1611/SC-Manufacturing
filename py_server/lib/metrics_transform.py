"""Metrics transform — port of server/lib/metricsTransform.ts."""
from __future__ import annotations

import copy
import math
import re
from typing import Any, Dict, List, Literal, Optional, TypedDict, Union

KpiDirection = Literal["good", "bad", "warn"]
ValueKey = Literal["dt_pct", "dt_hours"]


class KpiValue(TypedDict):
    value: str
    delta: str
    direction: KpiDirection


class SiteKpiRow(TypedDict):
    downtime_pct: float
    downtime_hrs: float
    stops: float


class FilterOptions(TypedDict, total=False):
    sites: List[str]
    regions: List[str]
    years: List[int]
    site_regions: Dict[str, str]
    departments: List[str]
    lines: List[str]
    shifts: List[str]


class MetricsMeta(TypedDict, total=False):
    year: int
    period: str
    week: str
    source: Literal["live", "cache", "demo", "sql"]
    partial: bool
    filters: Dict[str, str]
    filtered_site: str
    filtered_regions: str
    sql_warning: str


class ReasonRow(TypedDict):
    reason: str
    hours: float
    pct: float


class ShiftComparisonRow(TypedDict):
    shift: str
    hours: float
    color: str


class KeyInsight(TypedDict):
    text: str
    color: str


class MetricsPayload(TypedDict, total=False):
    meta: MetricsMeta
    periods: List[str]
    weeks: List[str]
    kpis: Dict[str, KpiValue]
    site_kpis: Dict[str, SiteKpiRow]
    tab_insights: Dict[str, str]
    filter_options: FilterOptions
    site_by_period: Dict[str, List[float]]
    site_by_period_hrs: Dict[str, List[float]]
    category_by_period: Dict[str, List[float]]
    category_by_period_hrs: Dict[str, List[float]]
    line_by_period: Dict[str, List[float]]
    line_by_period_hrs: Dict[str, List[float]]
    site_category_by_period: Dict[str, Dict[str, List[float]]]
    site_category_by_period_hrs: Dict[str, Dict[str, List[float]]]
    site_line_by_period: Dict[str, Dict[str, List[float]]]
    site_line_by_period_hrs: Dict[str, Dict[str, List[float]]]
    period_trend: List[float]
    period_trend_hrs: List[float]
    reasons: List[ReasonRow]
    dow_by_day_week: Dict[str, Dict[str, float]]
    dow_by_day_week_hrs: Dict[str, Dict[str, float]]
    dow_by_shift: Dict[str, Dict[str, Dict[str, float]]]
    dow_by_shift_hrs: Dict[str, Dict[str, Dict[str, float]]]
    top_lines: Dict[str, float]
    top_lines_hrs: Dict[str, float]
    top_sites_trend: Dict[str, List[float]]
    top_sites_trend_hrs: Dict[str, List[float]]
    shift_comparison: List[ShiftComparisonRow]
    key_insights: List[KeyInsight]
    maintenance_unplanned: Dict[str, Any]
    ytd_period_trend: List[float]
    ytd_periods: List[str]


class SqlQueryResults(TypedDict):
    kpis: List[Dict[str, Any]]
    siteKpis: List[Dict[str, Any]]
    periodTrend: List[Dict[str, Any]]
    siteByPeriod: List[Dict[str, Any]]
    categoryByPeriod: List[Dict[str, Any]]
    lineByPeriod: List[Dict[str, Any]]
    categoryNetwork: List[Dict[str, Any]]
    lineNetwork: List[Dict[str, Any]]
    reasons: List[Dict[str, Any]]
    dow: List[Dict[str, Any]]
    dowByShift: List[Dict[str, Any]]
    topLines: List[Dict[str, Any]]
    shiftComparison: List[Dict[str, Any]]
    filterOptions: List[Dict[str, Any]]
    filterDimensions: List[Dict[str, Any]]
    maintenanceUnplannedCard: List[Dict[str, Any]]
    maintenanceDtTrendYtd: List[Dict[str, Any]]


PERIODS: List[str] = [f"P{i + 1}" for i in range(10)]
WEEKS: List[str] = [
    "2026P01W01", "2026P01W02", "2026P01W03", "2026P01W04",
    "2026P02W01", "2026P02W02", "2026P02W03", "2026P02W04",
    "2026P03W01", "2026P03W02", "2026P03W03",
]
SITES: List[str] = [
    "ABERDEEN", "ARLINGTON", "BELOIT", "BRIDGEVIEW", "BROOKHOLLOW",
    "CAMBRIDGE", "CANTON", "CHARLOTTE", "DENVER", "FRISCO", "HOUSTON", "MODESTO", "PLANO",
]
SITE_WEIGHTS: Dict[str, float] = {
    "ABERDEEN": 1.0, "ARLINGTON": 0.92, "FRISCO": 1.08, "MODESTO": 0.85, "PLANO": 1.12,
    "BELOIT": 1.1, "BRIDGEVIEW": 4.5, "BROOKHOLLOW": 1.05, "CAMBRIDGE": 0.72, "CANTON": 0.52,
    "CHARLOTTE": 0.04, "DENVER": 0.88, "HOUSTON": 0.95,
}
CATEGORIES: List[str] = [
    "Changeover", "Equipment", "Facilities", "Materials", "No Event",
    "Operation", "Personnel", "Sanitation", "Warehouse",
]
CATEGORY_WEIGHTS: Dict[str, float] = {
    "Equipment": 0.28, "Operation": 0.18, "Changeover": 0.12, "Sanitation": 0.10,
    "No Event": 0.08, "Facilities": 0.08, "Materials": 0.08, "Personnel": 0.05, "Warehouse": 0.03,
}
LINES: List[str] = ["BCP1", "FCP1", "PTZ3", "SUN1", "TCS1", "DIP1", "FUN1", "FCC1", "PC1", "PC2"]
DAY_LABELS: List[str] = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]


def _round2(value: float) -> float:
    return round(float(value), 2)


def _locale_number(value: float | int) -> str:
    return f"{int(round(value)):,}"


def _parse_pct(v: Any) -> float:
    try:
        n = float(str(v if v is not None else "").replace("%", "").strip())
    except (TypeError, ValueError):
        return 6.2
    return n if math.isfinite(n) else 6.2


def _expand_series(values: List[float], target_len: int) -> List[float]:
    if not values:
        return [0.0] * target_len
    out = list(values)
    while len(out) < target_len:
        out.append(out[-1])
    return out[:target_len]


def normalize_period_trend_pct(
    values: List[Optional[float]],
    anchor: float,
    target_len: int = 10,
) -> List[float]:
    vals = [float(v) for v in values if v is not None and math.isfinite(float(v))]
    if not vals:
        synthetic = [_round2(anchor * (0.92 + i * 0.015)) for i in range(target_len)]
        return _expand_series(synthetic, target_len)
    if max(vals) > 50:
        avg = sum(vals) / len(vals)
        return [_round2(anchor * (v / (avg or 1))) for v in _expand_series(vals, target_len)]
    return [_round2(float(v)) for v in _expand_series(vals, target_len)]


def transform_dashboard(dashboard: Dict[str, Any]) -> Dict[str, Any]:
    kpis_raw = dashboard.get("kpis") or {}
    kpis: Dict[str, KpiValue] = {
        "downtime_pct": {
            "value": (kpis_raw.get("downtime_pct") or {}).get("value", "6.2%"),
            "delta": (kpis_raw.get("downtime_pct") or {}).get("delta", ""),
            "direction": (kpis_raw.get("downtime_pct") or {}).get("direction", "warn"),
        },
        "downtime_hrs": {
            "value": (kpis_raw.get("downtime_hrs") or {}).get("value", ""),
            "delta": (kpis_raw.get("downtime_hrs") or {}).get("delta", ""),
            "direction": (kpis_raw.get("downtime_hrs") or {}).get("direction", "warn"),
        },
        "stops": {
            "value": (kpis_raw.get("stops") or {}).get("value", ""),
            "delta": (kpis_raw.get("stops") or {}).get("delta", ""),
            "direction": (kpis_raw.get("stops") or {}).get("direction", "warn"),
        },
        "oee": {
            "value": (kpis_raw.get("oee") or {}).get("value", "N/A"),
            "delta": (kpis_raw.get("oee") or {}).get("delta", ""),
            "direction": (kpis_raw.get("oee") or {}).get("direction", "warn"),
        },
    }

    dt_trend = dashboard.get("downtime_trend") or {}
    anchor = _parse_pct(kpis["downtime_pct"]["value"])
    period_trend = normalize_period_trend_pct(dt_trend.get("data") or [], anchor, len(PERIODS))

    reasons: List[ReasonRow] = []
    for bullet in dashboard.get("downtime_bullets") or []:
        text = bullet.get("text") or ""
        if re.search(r"unavailable|waste", text, re.I):
            continue
        hours_match = re.search(r"([\d,]+\.?\d*)\s*h", text, re.I)
        hours = float(hours_match.group(1).replace(",", "")) if hours_match else 0.0
        name = (text.split(" caused")[0].split(" — ")[0].strip()[:80] or "RSN")
        reasons.append({
            "reason": name,
            "hours": hours,
            "pct": float(bullet.get("pct") or 0),
        })

    if not reasons:
        reasons = [
            {"reason": "No Event", "hours": 6255.3, "pct": 0.48},
            {"reason": "Unplanned Sanitation", "hours": 3107.66, "pct": 0.24},
            {"reason": "Equipment Failure", "hours": 2100.0, "pct": 0.18},
        ]

    if not kpis["downtime_hrs"]["value"]:
        total = sum(r["hours"] for r in reasons)
        kpis["downtime_hrs"] = {
            "value": f"{_locale_number(total)} h",
            "delta": kpis["downtime_pct"]["delta"] or "",
            "direction": kpis["downtime_pct"].get("direction") or "warn",
        }

    top_lines: Dict[str, float] = {}
    for item in dashboard.get("line_contributions") or []:
        line = item.get("line")
        if line and not re.search(r"unavailable", str(line), re.I):
            top_lines[str(line)] = float(item.get("pct") or 0)

    shift_comparison = [
        s for s in (dashboard.get("shift_comparison") or [])
        if (s or {}).get("hours", 0) > 0
    ]

    return {
        "meta": {"year": 2026, "period": "P09", "week": WEEKS[8], "source": "cache", "filters": {}},
        "periods": PERIODS,
        "weeks": WEEKS,
        "kpis": kpis,
        "period_trend": period_trend,
        "reasons": reasons,
        "top_lines": top_lines,
        "shift_comparison": shift_comparison,
        "site_by_period": {},
        "category_by_period": {},
        "line_by_period": {},
        "dow_by_day_week": {},
        "top_sites_trend": {},
        "tab_insights": {},
    }


def synthesize_from_trend(period_trend: List[float]) -> Dict[str, Any]:
    site_by_period: Dict[str, List[float]] = {}
    for site in SITES:
        w = SITE_WEIGHTS.get(site, 1.0)
        site_by_period[site] = [_round2(v * w * 0.42) for v in period_trend]

    category_by_period: Dict[str, List[float]] = {}
    for cat in CATEGORIES:
        w = CATEGORY_WEIGHTS.get(cat, 0.05)
        category_by_period[cat] = [_round2(v * w * 2.2) for v in period_trend]

    line_by_period: Dict[str, List[float]] = {}
    for line in LINES:
        line_by_period[line] = [_round2(v * 0.35 * 0.8) for v in period_trend]

    top_sites = sorted(SITE_WEIGHTS.items(), key=lambda item: item[1], reverse=True)[:5]
    top_sites_trend: Dict[str, List[float]] = {}
    for site, w in top_sites:
        top_sites_trend[site] = [_round2(v * w * 0.42) for v in period_trend]

    anchor = (sum(period_trend) / (len(period_trend) or 1)) or 6.2
    day_mult = [0.85, 1.0, 1.12, 1.05, 1.18, 1.0, 0.78]
    dow_by_day_week: Dict[str, Dict[str, float]] = {}
    for di, day_label in enumerate(DAY_LABELS):
        dow_by_day_week[day_label] = {}
        for wi, week in enumerate(WEEKS):
            dow_by_day_week[day_label][week] = _round2(anchor * day_mult[di] * (1 + wi * 0.008))

    return {
        "site_by_period": site_by_period,
        "category_by_period": category_by_period,
        "line_by_period": line_by_period,
        "top_sites_trend": top_sites_trend,
        "dow_by_day_week": dow_by_day_week,
    }


def build_tab_insights(m: MetricsPayload) -> Dict[str, str]:
    dt = m["kpis"]["downtime_pct"]
    dt_hrs = m["kpis"]["downtime_hrs"]
    stops = m["kpis"]["stops"]
    trend = m.get("period_trend") or []
    periods = m.get("periods") or []
    anchor = _parse_pct(dt["value"])
    peak_label = ""
    peak_val = anchor
    low_label = ""
    low_val = anchor
    if trend:
        peak_i = trend.index(max(trend))
        low_i = trend.index(min(trend))
        peak_label = periods[peak_i] if peak_i < len(periods) else f"P{peak_i + 1}"
        peak_val = trend[peak_i]
        low_label = periods[low_i] if low_i < len(periods) else f"P{low_i + 1}"
        low_val = trend[low_i]

    overview = (
        f"Unplanned DT % is {dt.get('value') or '—'} ({dt.get('delta') or 'vs prior period'}). "
        f"Peak at {peak_label or 'latest'} ({peak_val:.2f}%), "
        f"low at {low_label or '—'} ({low_val:.2f}%). "
        f"STOPS: {stops.get('value') or '—'}."
    )

    cats = m.get("category_by_period") or {}
    if cats:
        top_cat = max(cats.items(), key=lambda item: sum(item[1]))
        cat_avg = sum(top_cat[1]) / len(top_cat[1])
        category = (
            f"{top_cat[0]} leads unplanned DT at {cat_avg:.2f}% avg across {len(periods)} periods. "
            f"Network unplanned DT is {anchor:.2f}% — focus reduction on {top_cat[0]} root causes."
        )
    else:
        category = (
            f"Category-level unplanned DT averages {anchor:.2f}%. "
            "Expand site rows to compare RSN categories by period."
        )

    lines = m.get("top_lines") or {}
    if lines:
        ranked = sorted(lines.items(), key=lambda item: item[1], reverse=True)[:3]
        line = (
            "Top unplanned DT lines: "
            + ", ".join(f"{name} ({pct:.1f}%)" for name, pct in ranked)
            + ". Prioritize mechanical and changeover losses on highest-share lines."
        )
    else:
        line = (
            "Line-level unplanned DT is concentrated in a few assets — "
            "use the heatmap to identify top site/line combinations."
        )

    shifts = m.get("shift_comparison") or []
    if shifts:
        top_shift = max(shifts, key=lambda s: s.get("hours", 0))
        dow = (
            f"{top_shift['shift']} drives {_locale_number(top_shift['hours'])} unplanned DT hours. "
            "Compare shifts across days to target handover gaps."
        )
    else:
        dow = (
            "Day-of-week unplanned DT varies by shift — "
            "use the heatmap to compare Shift 1/2/3 patterns across weeks."
        )

    reasons = m.get("reasons") or []
    if reasons:
        top3 = reasons[:3]
        r_txt = "; ".join(
            f"{r['reason']} ({_locale_number(r['hours'])}h, {r['pct']:.2f}%)"
            for r in top3
        )
        trend_min = min(trend) if trend else anchor
        trend_max = max(trend) if trend else anchor
        reason = (
            f"Top unplanned DT reasons: {r_txt}. "
            f"Period trend ranges {trend_min:.2f}%–{trend_max:.2f}% "
            f"with total hours {dt_hrs.get('value') or '—'}."
        )
    else:
        reason = (
            f"Unplanned DT % trend spans {anchor:.2f}% across periods. "
            "Review RSN-level hours to prioritize contributors."
        )

    return {"overview": overview, "category": category, "line": line, "dow": dow, "reason": reason}


def enrich_metrics(
    base: Dict[str, Any],
    filters: Dict[str, Optional[str]],
    source: Literal["live", "cache", "demo", "sql"] = "cache",
) -> MetricsPayload:
    downtime_pct = (base.get("kpis") or {}).get("downtime_pct") or {}
    period_trend = base.get("period_trend") or normalize_period_trend_pct(
        [],
        _parse_pct(downtime_pct.get("value")),
        len(PERIODS),
    )
    synth = synthesize_from_trend(period_trend)

    default_kpis: Dict[str, KpiValue] = {
        "downtime_pct": {"value": "6.2%", "delta": "↓ 0.03pp vs prior week", "direction": "good"},
        "downtime_hrs": {"value": "1,014 h", "delta": "", "direction": "good"},
        "stops": {"value": "819", "delta": "", "direction": "good"},
        "oee": {"value": "N/A", "delta": "", "direction": "warn"},
    }

    def _use_base_or_synth(key: str) -> Any:
        value = base.get(key)
        return value if value and len(value) else synth[key]

    m: MetricsPayload = {
        "meta": {
            "year": 2026,
            "period": "P09",
            "week": WEEKS[8],
            "source": source,
            "filters": {k: str(v) for k, v in filters.items() if v is not None},
        },
        "periods": PERIODS,
        "weeks": WEEKS,
        "kpis": base.get("kpis") or default_kpis,
        "tab_insights": {},
        "site_by_period": _use_base_or_synth("site_by_period"),
        "category_by_period": _use_base_or_synth("category_by_period"),
        "line_by_period": _use_base_or_synth("line_by_period"),
        "period_trend": period_trend,
        "reasons": base.get("reasons") or [],
        "dow_by_day_week": _use_base_or_synth("dow_by_day_week"),
        "top_lines": base.get("top_lines") or {},
        "top_sites_trend": _use_base_or_synth("top_sites_trend"),
        "shift_comparison": base.get("shift_comparison") or [],
    }
    if base.get("key_insights") is not None:
        m["key_insights"] = base["key_insights"]

    m["tab_insights"] = build_tab_insights(m)
    return m


def metrics_from_cache(filters: Dict[str, Optional[str]]) -> MetricsPayload:
    return enrich_metrics({}, filters, "demo")


def metrics_from_dashboard_cache(
    dashboard: Dict[str, Any],
    filters: Dict[str, Optional[str]],
) -> MetricsPayload:
    return enrich_metrics(transform_dashboard(dashboard), filters, "cache")


def _parse_hours(v: Any) -> float:
    try:
        n = float(re.sub(r"[^0-9.]", "", str(v if v is not None else "")))
    except (TypeError, ValueError):
        return 0.0
    return n if math.isfinite(n) else 0.0


def format_kpis_from_raw(raw: Dict[str, Any]) -> Dict[str, KpiValue]:
    dt_pct = float(raw.get("downtime_pct") or 0)
    dt_hrs = float(raw.get("downtime_hrs") or 0)
    stops = float(raw.get("stops") or 0)
    return {
        "downtime_pct": {
            "value": f"{dt_pct:.2f}%",
            "delta": "vs prior period",
            "direction": "bad" if dt_pct > 5 else "good",
        },
        "downtime_hrs": {
            "value": f"{_locale_number(dt_hrs)} h",
            "delta": "",
            "direction": "warn",
        },
        "stops": {
            "value": str(int(round(stops))),
            "delta": "",
            "direction": "warn",
        },
        "oee": {"value": "N/A", "delta": "Not in metric view", "direction": "warn"},
    }


def _build_site_kpis_map(rows: List[Dict[str, Any]]) -> Dict[str, SiteKpiRow]:
    out: Dict[str, SiteKpiRow] = {}
    for row in rows:
        site = str(row.get("site") or "").upper()
        if not site:
            continue
        out[site] = {
            "downtime_pct": _round2(float(row.get("downtime_pct") or 0)),
            "downtime_hrs": _round2(float(row.get("downtime_hrs") or 0)),
            "stops": _round2(float(row.get("stops") or 0)),
        }
    return out


def _period_values_with_signal(arr: Optional[List[Optional[float]]]) -> List[float]:
    out: List[float] = []
    for v in arr or []:
        if v is None:
            continue
        try:
            n = float(v)
        except (TypeError, ValueError):
            continue
        if math.isfinite(n) and n > 0:
            out.append(n)
    return out


def _derive_kpis_from_site_periods(metrics: MetricsPayload, site_key: str) -> Dict[str, KpiValue]:
    base = metrics["kpis"]
    is_sql = (metrics.get("meta") or {}).get("source") == "sql"
    raw_pct = _parse_pct(base.get("downtime_pct", {}).get("value"))
    dt_pct = raw_pct if math.isfinite(raw_pct) else 0.0
    dt_hrs = _parse_hours(base.get("downtime_hrs", {}).get("value"))
    try:
        stops = int(str(base.get("stops", {}).get("value") or "0").replace(",", ""))
    except ValueError:
        stops = 0

    if is_sql:
        return base

    site_by_period = metrics.get("site_by_period") or {}
    period_vals = _period_values_with_signal(site_by_period.get(site_key))
    if not period_vals:
        period_vals = _period_values_with_signal(metrics.get("period_trend"))
    if not period_vals and metrics.get("period_trend"):
        mult = SITE_WEIGHTS.get(site_key, 1.0)
        period_vals = [
            _round2(float(v or 0) * mult * 0.95)
            for v in metrics["period_trend"]
            if _round2(float(v or 0) * mult * 0.95) > 0
        ]

    if period_vals and dt_pct == 0:
        dt_pct = sum(period_vals) / len(period_vals)

    if dt_hrs == 0 and dt_pct > 0:
        mult = SITE_WEIGHTS.get(site_key, 1.0)
        n = len(metrics.get("periods") or PERIODS)
        dt_hrs = round((112474 / 6.2) * dt_pct * mult * (len(period_vals) / n))

    if stops == 0 and dt_pct > 0:
        mult = SITE_WEIGHTS.get(site_key, 1.0)
        stops = max(1, round(819 * (dt_pct / 6.2) * mult))

    benchmark = dt_pct if dt_pct > 0 else 6.2
    return {
        "downtime_pct": {
            "value": f"{dt_pct:.2f}%",
            "delta": base.get("downtime_pct", {}).get("delta") or "vs prior period",
            "direction": "warn" if dt_pct == 0 else ("bad" if dt_pct >= benchmark * 1.05 else "good"),
        },
        "downtime_hrs": {
            "value": f"{_locale_number(dt_hrs)} h",
            "delta": base.get("downtime_hrs", {}).get("delta") or "",
            "direction": "warn" if dt_hrs == 0 else (base.get("downtime_hrs", {}).get("direction") or "warn"),
        },
        "stops": {
            "value": str(stops or 0),
            "delta": base.get("stops", {}).get("delta") or "",
            "direction": "warn" if stops == 0 else (base.get("stops", {}).get("direction") or "warn"),
        },
        "oee": base.get("oee") or {"value": "N/A", "delta": "Not in metric view", "direction": "warn"},
    }


def apply_site_filter(metrics: MetricsPayload, site: Optional[str]) -> MetricsPayload:
    if not site:
        return metrics
    site_key = site.upper()
    out: MetricsPayload = copy.deepcopy(metrics)

    site_by_period = out.get("site_by_period") or {}
    if site_key in site_by_period:
        out["site_by_period"] = {site_key: site_by_period[site_key]}

    site_by_period_hrs = out.get("site_by_period_hrs")
    if site_by_period_hrs and site_key in site_by_period_hrs:
        out["site_by_period_hrs"] = {site_key: site_by_period_hrs[site_key]}
    elif site_by_period_hrs is not None:
        out["site_by_period_hrs"] = {}

    top_sites_trend = out.get("top_sites_trend") or {}
    if site_key in top_sites_trend:
        out["top_sites_trend"] = {site_key: top_sites_trend[site_key]}

    top_sites_trend_hrs = out.get("top_sites_trend_hrs")
    if top_sites_trend_hrs and site_key in top_sites_trend_hrs:
        out["top_sites_trend_hrs"] = {site_key: top_sites_trend_hrs[site_key]}
    elif top_sites_trend_hrs is not None:
        out["top_sites_trend_hrs"] = {}

    site_category = out.get("site_category_by_period")
    if site_category is not None:
        out["site_category_by_period"] = (
            {site_key: site_category[site_key]} if site_key in site_category else {}
        )

    site_category_hrs = out.get("site_category_by_period_hrs")
    if site_category_hrs is not None:
        out["site_category_by_period_hrs"] = (
            {site_key: site_category_hrs[site_key]} if site_key in site_category_hrs else {}
        )

    site_line = out.get("site_line_by_period")
    if site_line is not None:
        out["site_line_by_period"] = (
            {site_key: site_line[site_key]} if site_key in site_line else {}
        )

    site_line_hrs = out.get("site_line_by_period_hrs")
    if site_line_hrs is not None:
        out["site_line_by_period_hrs"] = (
            {site_key: site_line_hrs[site_key]} if site_key in site_line_hrs else {}
        )

    meta = out.get("meta") or {}
    if meta.get("source") == "sql":
        if site_by_period.get(site_key):
            out["period_trend"] = list(site_by_period[site_key])
        site_kpis = out.get("site_kpis") or {}
        if site_key in site_kpis:
            out["kpis"] = format_kpis_from_raw(site_kpis[site_key])
        meta["filtered_site"] = site_key
        out["meta"] = meta
        out["tab_insights"] = build_tab_insights(out)
        return out

    site_keys = list(out.get("site_by_period") or {})
    already_site_scoped = len(site_keys) == 1 and site_keys[0] == site_key
    if not already_site_scoped:
        mult = SITE_WEIGHTS.get(site_key, 1.0)
        out["period_trend"] = [_round2(v * mult * 0.95) for v in out.get("period_trend") or []]
    elif site_by_period.get(site_key):
        scoped = [v for v in site_by_period[site_key] if v is not None and float(v) > 0]
        if scoped:
            out["period_trend"] = list(site_by_period[site_key])

    out["kpis"] = _derive_kpis_from_site_periods(out, site_key)
    out["tab_insights"] = build_tab_insights(out)
    meta["filtered_site"] = site_key
    out["meta"] = meta
    return out


def query_result_for_key(query_key: str, metrics: MetricsPayload) -> Dict[str, Any]:
    if query_key == "dashboard_dt_kpis":
        return {"rows": [metrics["kpis"]]}
    if query_key == "dashboard_dt_site_kpis":
        return {
            "rows": [
                {"site": site, **kpi}
                for site, kpi in (metrics.get("site_kpis") or {}).items()
            ],
        }
    if query_key == "dashboard_dt_period_trend":
        return {
            "rows": [
                {"period_label": p, "dt_pct": metrics["period_trend"][i]}
                for i, p in enumerate(metrics.get("periods") or [])
            ],
        }
    if query_key == "dashboard_dt_site_by_period":
        rows: List[Dict[str, Any]] = []
        for site, vals in (metrics.get("site_by_period") or {}).items():
            for i, dt_pct in enumerate(vals):
                rows.append({
                    "site": site,
                    "period_label": metrics["periods"][i],
                    "dt_pct": dt_pct,
                })
        return {"rows": rows}
    if query_key == "dashboard_dt_category_by_period":
        rows = []
        for category, vals in (metrics.get("category_by_period") or {}).items():
            for i, dt_pct in enumerate(vals):
                rows.append({
                    "category": category,
                    "period_label": metrics["periods"][i],
                    "dt_pct": dt_pct,
                })
        return {"rows": rows}
    if query_key == "dashboard_dt_line_by_period":
        rows = []
        for line, vals in (metrics.get("line_by_period") or {}).items():
            for i, dt_pct in enumerate(vals):
                rows.append({
                    "line": line,
                    "period_label": metrics["periods"][i],
                    "dt_pct": dt_pct,
                })
        return {"rows": rows}
    if query_key == "dashboard_dt_reasons":
        return {"rows": metrics.get("reasons") or []}
    if query_key == "dashboard_dt_dow":
        rows = []
        for day_name, weeks in (metrics.get("dow_by_day_week") or {}).items():
            for week_label, dt_pct in weeks.items():
                rows.append({"day_name": day_name, "week_label": week_label, "dt_pct": dt_pct})
        return {"rows": rows}
    if query_key == "dashboard_dt_top_lines":
        return {
            "rows": [
                {"line": line, "dt_pct": dt_pct}
                for line, dt_pct in (metrics.get("top_lines") or {}).items()
            ],
        }
    if query_key == "dashboard_dt_shift_comparison":
        return {"rows": metrics.get("shift_comparison") or []}
    if query_key == "dashboard_filter_options":
        filter_options = metrics.get("filter_options") or {}
        sites = filter_options.get("sites") or list((metrics.get("site_by_period") or {}).keys())
        site_regions = filter_options.get("site_regions") or {}
        return {
            "rows": [
                {"site": site, "region": site_regions.get(site)}
                for site in sites
            ],
        }
    if query_key == "dashboard_dt_dow_by_shift":
        rows = []
        for day_name, shifts in (metrics.get("dow_by_shift") or {}).items():
            for shift_label, weeks in shifts.items():
                for week_label, dt_pct in weeks.items():
                    rows.append({
                        "day_name": day_name,
                        "shift_label": shift_label,
                        "week_label": week_label,
                        "dt_pct": dt_pct,
                    })
        return {"rows": rows}
    return {"rows": []}


def _sort_periods(labels: List[str]) -> List[str]:
    def sort_key(label: str) -> tuple[int, str]:
        digits = re.sub(r"\D", "", str(label))
        return (int(digits) if digits else 0, str(label))

    return sorted(set(labels), key=sort_key)


def _pivot_metric_rows(
    rows: List[Dict[str, Any]],
    entity_key: str,
    periods: List[str],
    value_key: ValueKey = "dt_pct",
) -> Dict[str, List[float]]:
    out: Dict[str, List[float]] = {}
    for row in rows:
        entity = str(row.get(entity_key) or "").upper()
        period = str(row.get("period_label") or "")
        val = float(row.get(value_key) or 0)
        if not entity or not period:
            continue
        if entity not in out:
            out[entity] = [0.0] * len(periods)
        idx = periods.index(period) if period in periods else -1
        if idx >= 0:
            out[entity][idx] = _round2(val)
    return out


def pivot_site_entity_rows(
    rows: List[Dict[str, Any]],
    entity_key: str,
    periods: List[str],
    value_key: ValueKey = "dt_pct",
) -> Dict[str, Dict[str, List[float]]]:
    out: Dict[str, Dict[str, List[float]]] = {}
    for row in rows:
        site = str(row.get("site") or "").upper()
        entity = str(row.get(entity_key) or "").upper()
        period = str(row.get("period_label") or "")
        val = float(row.get(value_key) or 0)
        if not site or not entity or not period:
            continue
        if site not in out:
            out[site] = {}
        if entity not in out[site]:
            out[site][entity] = [0.0] * len(periods)
        idx = periods.index(period) if period in periods else -1
        if idx >= 0:
            out[site][entity][idx] = _round2(val)
    return out


def _aggregate_entity_by_period(
    rows: List[Dict[str, Any]],
    entity_key: str,
    periods: List[str],
    pct_key: Literal["dt_pct"] = "dt_pct",
    hrs_key: Literal["dt_hours"] = "dt_hours",
) -> Dict[str, Dict[str, List[float]]]:
    pct_agg: Dict[str, Dict[int, Dict[str, float]]] = {}
    hrs_agg: Dict[str, Dict[int, float]] = {}
    for row in rows:
        entity = str(row.get(entity_key) or "")
        period = str(row.get("period_label") or "")
        pct = float(row.get(pct_key) or 0)
        hrs = float(row.get(hrs_key) or 0)
        if not entity:
            continue
        idx = periods.index(period) if period in periods else -1
        if idx < 0:
            continue
        if entity not in pct_agg:
            pct_agg[entity] = {}
        if idx not in pct_agg[entity]:
            pct_agg[entity][idx] = {"sum": 0.0, "count": 0.0}
        pct_agg[entity][idx]["sum"] += pct
        pct_agg[entity][idx]["count"] += 1
        if entity not in hrs_agg:
            hrs_agg[entity] = {}
        hrs_agg[entity][idx] = hrs_agg[entity].get(idx, 0.0) + hrs

    entities = set(pct_agg.keys()) | set(hrs_agg.keys())
    pct: Dict[str, List[float]] = {}
    hrs: Dict[str, List[float]] = {}
    for entity in entities:
        pct[entity] = [
            _round2(pct_agg[entity][idx]["sum"] / pct_agg[entity][idx]["count"])
            if entity in pct_agg and idx in pct_agg[entity]
            else 0.0
            for idx in range(len(periods))
        ]
        hrs[entity] = [
            _round2(hrs_agg.get(entity, {}).get(idx, 0.0))
            for idx in range(len(periods))
        ]
    return {"pct": pct, "hrs": hrs}


def build_filter_options(rows: List[Dict[str, Any]]) -> FilterOptions:
    site_regions: Dict[str, str] = {}
    sites: List[str] = []
    regions: set[str] = set()
    years: set[int] = set()
    for row in rows:
        site = str(row.get("site") or "").upper()
        region = str(row.get("region") or "").strip()
        try:
            year = int(row.get("year"))
        except (TypeError, ValueError):
            year = float("nan")
        if not site:
            continue
        if site not in sites:
            sites.append(site)
        if region:
            site_regions[site] = region
            regions.add(region)
        if math.isfinite(year):
            years.add(int(year))
    sites.sort()
    return {
        "sites": sites,
        "regions": sorted(regions),
        "years": sorted(years, reverse=True),
        "site_regions": site_regions,
    }


def _build_dow_by_shift(
    rows: List[Dict[str, Any]],
    value_key: ValueKey = "dt_pct",
) -> Dict[str, Dict[str, Dict[str, float]]]:
    out: Dict[str, Dict[str, Dict[str, float]]] = {}
    for row in rows:
        day = str(row.get("day_name") or "")
        week = str(row.get("week_label") or "")
        shift = str(row.get("shift_label") or "").strip()
        val = float(row.get(value_key) or 0)
        if not day or not week or not shift:
            continue
        out.setdefault(day, {}).setdefault(shift, {})[week] = _round2(val)
    return out


def build_core_metrics_from_sql(
    kpi_rows: List[Dict[str, Any]],
    site_rows: List[Dict[str, Any]],
    filters: Dict[str, Optional[str]],
) -> MetricsPayload:
    """Minimal live payload — network/site KPIs only (fast path before chart queries)."""
    k = kpi_rows[0] if kpi_rows else {}
    kpis = format_kpis_from_raw(k)
    site_kpis = _build_site_kpis_map(site_rows)
    year_num = int(filters["year"]) if filters.get("year") else 2026
    m: MetricsPayload = {
        "meta": {
            "year": year_num,
            "period": PERIODS[-1] if PERIODS else "P09",
            "week": WEEKS[-1] if WEEKS else "",
            "source": "sql",
            "partial": True,
            "filters": {k: str(v) for k, v in filters.items() if v is not None},
        },
        "periods": PERIODS,
        "weeks": WEEKS,
        "kpis": kpis,
        "site_kpis": site_kpis,
        "tab_insights": {},
    }
    m["tab_insights"] = build_tab_insights(m)
    return m


def build_metrics_from_sql(
    results: SqlQueryResults,
    filters: Dict[str, Optional[str]],
) -> MetricsPayload:
    period_labels = _sort_periods([
        str(r.get("period_label") or "")
        for r in results["periodTrend"]
        if r.get("period_label")
    ])
    periods = period_labels if period_labels else PERIODS

    period_trend: List[float] = []
    period_trend_hrs: List[float] = []
    for p in periods:
        row = next((r for r in results["periodTrend"] if str(r.get("period_label")) == p), None)
        period_trend.append(_round2(float(row.get("dt_pct") or 0)) if row else 0.0)
        period_trend_hrs.append(_round2(float(row.get("dt_hours") or 0)) if row else 0.0)

    k = results["kpis"][0] if results["kpis"] else {}
    kpis = format_kpis_from_raw(k)
    site_kpis = _build_site_kpis_map(results["siteKpis"])

    site_by_period = _pivot_metric_rows(results["siteByPeriod"], "site", periods, "dt_pct")
    site_by_period_hrs = _pivot_metric_rows(results["siteByPeriod"], "site", periods, "dt_hours")
    site_category_by_period = pivot_site_entity_rows(results["categoryByPeriod"], "category", periods, "dt_pct")
    site_category_by_period_hrs = pivot_site_entity_rows(results["categoryByPeriod"], "category", periods, "dt_hours")
    site_line_by_period = pivot_site_entity_rows(results["lineByPeriod"], "line", periods, "dt_pct")
    site_line_by_period_hrs = pivot_site_entity_rows(results["lineByPeriod"], "line", periods, "dt_hours")

    category_by_period = _pivot_metric_rows(results["categoryNetwork"], "category", periods, "dt_pct")
    category_by_period_hrs = _pivot_metric_rows(results["categoryNetwork"], "category", periods, "dt_hours")
    line_by_period = _pivot_metric_rows(results["lineNetwork"], "line", periods, "dt_pct")
    line_by_period_hrs = _pivot_metric_rows(results["lineNetwork"], "line", periods, "dt_hours")

    top_lines: Dict[str, float] = {}
    top_lines_hrs: Dict[str, float] = {}
    for row in results["topLines"]:
        line = str(row.get("line") or "").upper()
        if line:
            top_lines[line] = _round2(float(row.get("dt_pct") or 0))
            top_lines_hrs[line] = _round2(float(row.get("dt_hours") or 0))

    weeks = _sort_periods([
        str(r.get("week_label") or "")
        for r in results["dow"]
        if r.get("week_label")
    ])
    dow_weeks = weeks if weeks else WEEKS

    dow_by_day_week: Dict[str, Dict[str, float]] = {}
    dow_by_day_week_hrs: Dict[str, Dict[str, float]] = {}
    for row in results["dow"]:
        day = str(row.get("day_name") or "")
        week = str(row.get("week_label") or "")
        pct = float(row.get("dt_pct") or 0)
        hrs = float(row.get("dt_hours") or 0)
        if not day or not week:
            continue
        dow_by_day_week.setdefault(day, {})[week] = _round2(pct)
        dow_by_day_week_hrs.setdefault(day, {})[week] = _round2(hrs)

    reasons = [
        {
            "reason": str(r.get("reason") or "Unknown"),
            "hours": _round2(float(r.get("hours") or 0)),
            "pct": _round2(float(r.get("pct") or 0)),
        }
        for r in results["reasons"]
    ]

    shift_comparison = [
        {
            "shift": str(r.get("shift") or "Shift"),
            "hours": _round2(float(r.get("hours") or 0)),
        }
        for r in results["shiftComparison"]
    ]

    top_sites_trend: Dict[str, List[float]] = {}
    top_sites_trend_hrs: Dict[str, List[float]] = {}
    site_totals = sorted(
        ((site, sum(vals)) for site, vals in site_by_period_hrs.items()),
        key=lambda item: item[1],
        reverse=True,
    )[:5]
    for site, _ in site_totals:
        top_sites_trend[site] = site_by_period[site]
        top_sites_trend_hrs[site] = site_by_period_hrs[site]

    dow_by_shift = _build_dow_by_shift(results["dowByShift"], "dt_pct")
    dow_by_shift_hrs = _build_dow_by_shift(results["dowByShift"], "dt_hours")

    ytd_period_labels = _sort_periods([
        str(r.get("period_label") or "")
        for r in results.get("maintenanceDtTrendYtd") or []
        if r.get("period_label")
    ])
    ytd_period_trend: List[float] = []
    for p in ytd_period_labels:
        row = next(
            (r for r in (results.get("maintenanceDtTrendYtd") or []) if str(r.get("period_label")) == p),
            None,
        )
        ytd_period_trend.append(_round2(float(row.get("dt_pct") or 0)) if row else 0.0)

    maintenance_unplanned = (results.get("maintenanceUnplannedCard") or [{}])[0]
    filter_options = build_filter_options(results["filterOptions"])
    departments: set[str] = set()
    lines: set[str] = set()
    shifts: set[str] = set()
    for row in results.get("filterDimensions") or []:
        dept = str(row.get("department") or "").strip()
        line = str(row.get("line") or "").strip()
        shift = str(row.get("shift") or "").strip()
        if dept:
            departments.add(dept)
        if line:
            lines.add(line)
        if shift:
            shifts.add(shift)
    if departments:
        filter_options["departments"] = sorted(departments)
    if lines:
        filter_options["lines"] = sorted(lines)
    if shifts:
        filter_options["shifts"] = sorted(shifts)
    if not filter_options["sites"]:
        filter_options["sites"] = sorted(site_by_period.keys())
        for site in filter_options["sites"]:
            if site not in filter_options["site_regions"]:
                filter_options["site_regions"][site] = "Unknown"
    if not filter_options["years"] and filters.get("year"):
        filter_options["years"] = [int(filters["year"])]

    year_num = (
        int(filters["year"])
        if filters.get("year")
        else (filter_options["years"][0] if filter_options["years"] else 2026)
    )

    meta: MetricsMeta = {
        "year": year_num,
        "period": periods[-1] if periods else "P09",
        "week": dow_weeks[-1] if dow_weeks else "",
        "source": "sql",
        "filters": {k: str(v) for k, v in filters.items() if v is not None},
    }
    m: MetricsPayload = {
        "meta": meta,
        "periods": periods,
        "weeks": dow_weeks,
        "kpis": kpis,
        "site_kpis": site_kpis,
        "tab_insights": {},
        "filter_options": filter_options,
        "site_by_period": site_by_period,
        "site_by_period_hrs": site_by_period_hrs,
        "category_by_period": category_by_period,
        "category_by_period_hrs": category_by_period_hrs,
        "line_by_period": line_by_period,
        "line_by_period_hrs": line_by_period_hrs,
        "site_category_by_period": site_category_by_period,
        "site_category_by_period_hrs": site_category_by_period_hrs,
        "site_line_by_period": site_line_by_period,
        "site_line_by_period_hrs": site_line_by_period_hrs,
        "period_trend": period_trend,
        "period_trend_hrs": period_trend_hrs,
        "reasons": reasons,
        "dow_by_day_week": dow_by_day_week,
        "dow_by_day_week_hrs": dow_by_day_week_hrs,
        "dow_by_shift": dow_by_shift,
        "dow_by_shift_hrs": dow_by_shift_hrs,
        "top_lines": top_lines,
        "top_lines_hrs": top_lines_hrs,
        "top_sites_trend": top_sites_trend,
        "top_sites_trend_hrs": top_sites_trend_hrs,
        "shift_comparison": shift_comparison,
        "maintenance_unplanned": maintenance_unplanned,
        "ytd_period_trend": ytd_period_trend,
        "ytd_periods": ytd_period_labels,
    }
    m["tab_insights"] = build_tab_insights(m)
    return m


# CamelCase aliases matching TypeScript export names for callers migrating from Node.
normalizePeriodTrendPct = normalize_period_trend_pct
buildTabInsights = build_tab_insights
enrichMetrics = enrich_metrics
metricsFromCache = metrics_from_cache
metricsFromDashboardCache = metrics_from_dashboard_cache
formatKpisFromRaw = format_kpis_from_raw
applySiteFilter = apply_site_filter
queryResultForKey = query_result_for_key
buildFilterOptions = build_filter_options
buildCoreMetricsFromSql = build_core_metrics_from_sql
buildMetricsFromSql = build_metrics_from_sql
transformDashboard = transform_dashboard
synthesizeFromTrend = synthesize_from_trend

__all__ = [
    "MetricsPayload",
    "SqlQueryResults",
    "FilterOptions",
    "PERIODS",
    "WEEKS",
    "SITES",
    "SITE_WEIGHTS",
    "CATEGORIES",
    "CATEGORY_WEIGHTS",
    "LINES",
    "DAY_LABELS",
    "normalize_period_trend_pct",
    "normalizePeriodTrendPct",
    "transform_dashboard",
    "transformDashboard",
    "synthesize_from_trend",
    "synthesizeFromTrend",
    "build_tab_insights",
    "buildTabInsights",
    "enrich_metrics",
    "enrichMetrics",
    "metrics_from_cache",
    "metricsFromCache",
    "metrics_from_dashboard_cache",
    "metricsFromDashboardCache",
    "format_kpis_from_raw",
    "formatKpisFromRaw",
    "apply_site_filter",
    "applySiteFilter",
    "query_result_for_key",
    "queryResultForKey",
    "pivot_site_entity_rows",
    "build_filter_options",
    "buildFilterOptions",
    "build_core_metrics_from_sql",
    "buildCoreMetricsFromSql",
    "build_metrics_from_sql",
    "buildMetricsFromSql",
]
