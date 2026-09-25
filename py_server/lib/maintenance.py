"""Maintenance console payload builder — derived from MetricsPayload."""
from __future__ import annotations

import math
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from py_server.lib.metrics_transform import MetricsPayload, build_tab_insights

DT_TARGET_PCT = 4.5  # Demo/offline fallback only — live target comes from SQL (see _resolve_unplanned_target).
MTBF_TARGET_HRS = 12.0

PERIOD_DELTA_MAP: Dict[str, tuple[str, str]] = {
    "ptd": ("vs prior period", "Period to date"),
    "wtd": ("vs prior week", "Week to date"),
    "ytd": ("vs prior year", "Year to date"),
    "fy": ("vs prior fiscal year", "Fiscal year"),
    "fiscal_year": ("vs prior fiscal year", "Fiscal year"),
    "mtd": ("vs prior month", "Month to date"),
    "qtd": ("vs prior quarter", "Quarter to date"),
    "week": ("vs prior week", "Week to date"),
    "month": ("vs prior month", "Month to date"),
    "quarter": ("vs prior quarter", "Quarter to date"),
    "year": ("vs prior year", "Year to date"),
    "shift": ("vs prior shift", "Last completed shift"),
    "custom": ("vs prior range", "Custom range"),
}


def _parse_pct(value: Any) -> float:
    try:
        n = float(str(value if value is not None else "").replace("%", "").strip())
    except (TypeError, ValueError):
        return 0.0
    return n if math.isfinite(n) else 0.0


def _parse_hours(value: Any) -> float:
    try:
        n = float(str(value if value is not None else "").replace(",", "").replace(" h", "").strip())
    except (TypeError, ValueError):
        return 0.0
    return n if math.isfinite(n) else 0.0


def _locale_number(value: float | int) -> str:
    return f"{int(round(value)):,}"


def _estimate_sched_hours(dt_hrs: float, dt_pct: float) -> float:
    if dt_pct <= 0 or dt_hrs <= 0:
        return 0.0
    return round(dt_hrs * 100.0 / dt_pct, 2)


def _metric_row_value(row: dict[str, Any] | None, *keys: str) -> Any:
    """Read a SQL row field case-insensitively (Databricks column casing varies)."""
    if not row:
        return None
    index = {str(k).lower(): v for k, v in row.items() if k is not None}
    for key in keys:
        if key.lower() in index and index[key.lower()] is not None:
            return index[key.lower()]
    return None


def _format_report_pct_display(value: float | None) -> str | None:
    if value is None:
        return None
    one = round(value, 1)
    if abs(value - one) < 0.06:
        return f"{one:.1f} %"
    return f"{value:.2f} %"


def _timeframe_key(filters: dict[str, Any] | None, metrics: MetricsPayload) -> str:
    meta_filters = (metrics.get("meta") or {}).get("filters") or {}
    raw = (
        (filters or {}).get("timeframe")
        or (filters or {}).get("timeframe_mode")
        or meta_filters.get("timeframe")
        or "ptd"
    )
    tf = str(raw).strip().lower()
    if tf in ("fy", "fiscal_year", "year"):
        return "ytd"
    return tf


def _compute_last_period_delta(
    timeframe: str,
    dt_pct: float,
    prev_period_pct: float,
    ytd_trend: list[float],
    latest_week_pct: float | None = None,
) -> tuple[float, str]:
    """Return (delta pp, UI label suffix) aligned with the selected timeframe."""
    if timeframe == "ytd" and len(ytd_trend) >= 2:
        delta = round(float(ytd_trend[-1]) - float(ytd_trend[-2]), 2)
        return delta, "Last Period"
    if timeframe == "wtd":
        baseline = latest_week_pct if latest_week_pct is not None else prev_period_pct
        return round(dt_pct - baseline, 2), "Last Week"
    if timeframe == "prev_week":
        return round(dt_pct - prev_period_pct, 2), "Prior Week"
    if timeframe == "prev_period":
        return round(dt_pct - prev_period_pct, 2), "Prior Period"
    if timeframe == "today":
        return round(dt_pct - prev_period_pct, 2), "Prior Day"
    # PTD / custom: compare current slice to previous fiscal period baseline
    return round(dt_pct - prev_period_pct, 2), "Last Period"


def _period_delta_labels(filters: dict[str, Any] | None) -> tuple[str, str]:
    filters = filters or {}
    tf = str(
        filters.get("timeframe")
        or filters.get("timeframe_mode")
        or (filters.get("meta") or {}).get("filters", {}).get("timeframe")
        or "FY"
    ).lower()
    return PERIOD_DELTA_MAP.get(tf, ("vs prior period", tf.upper()))


def _env_configured_target() -> float | None:
    for key in ("DATABRICKS_FLNA_DT_TARGET_PCT", "MAINTENANCE_DT_TARGET_PCT", "DATABRICKS_DT_TARGET_PCT"):
        raw = (os.environ.get(key) or "").strip()
        if not raw:
            continue
        try:
            val = float(raw)
            return val if math.isfinite(val) else None
        except ValueError:
            continue
    return None


def _resolve_unplanned_target(metrics: MetricsPayload) -> float:
    """FLNA / operational target — live SQL first, then env, demo constant last."""
    card = metrics.get("maintenance_unplanned") or {}
    if card.get("ytd_target_dt_pct") is not None:
        return _parse_pct(card.get("ytd_target_dt_pct"))
    env_target = _env_configured_target()
    if env_target is not None:
        return env_target
    if _metrics_is_live(metrics):
        return 0.0
    return DT_TARGET_PCT


def _env_float_target(*keys: str, default: float) -> float:
    for key in keys:
        raw = (os.environ.get(key) or "").strip()
        if not raw:
            continue
        try:
            val = float(raw)
            return val if math.isfinite(val) else default
        except ValueError:
            continue
    return default


def _env_mtbf_target_configured() -> float | None:
    for key in ("MAINTENANCE_MTBF_TARGET_HRS", "DATABRICKS_MTBF_TARGET_HRS"):
        raw = (os.environ.get(key) or "").strip()
        if not raw:
            continue
        try:
            val = float(raw)
            return val if math.isfinite(val) else None
        except ValueError:
            continue
    return None


def _resolve_mtbf_target(metrics: MetricsPayload) -> float:
    """Target from SQL YTD slice of MTBF measure — mirrors _resolve_unplanned_target."""
    card = metrics.get("maintenance_mtbf") or {}
    raw = _metric_row_value(card, "ytd_target_mtbf_hrs")
    if raw is not None:
        try:
            val = float(raw)
            return val if math.isfinite(val) else 0.0
        except (TypeError, ValueError):
            pass
    env_target = _env_mtbf_target_configured()
    if env_target is not None:
        return env_target
    if _metrics_is_live(metrics):
        return 0.0
    return MTBF_TARGET_HRS


def _kpi_status_dot(value: float, target: float, *, higher_is_better: bool = False) -> str:
    if higher_is_better:
        return "critical" if value < target else "good"
    if value > target + 1.0:
        return "critical"
    if value > target:
        return "warning"
    return "good"


def _trend_labels(metrics: MetricsPayload, trend: list[float], periods_key: str) -> list[str]:
    periods = metrics.get(periods_key) or metrics.get("ytd_periods") or []
    if periods:
        return periods[: len(trend)]
    return [f"P{i + 1}" for i in range(len(trend))]


def _resolve_primary_dt_pct(metrics: MetricsPayload) -> float:
    card = metrics.get("maintenance_unplanned") or {}
    if card.get("current_dt_pct") is not None:
        return _parse_pct(card.get("current_dt_pct"))
    return _parse_pct((metrics.get("kpis") or {}).get("downtime_pct", {}).get("value"))


def _resolve_primary_dt_hrs(metrics: MetricsPayload) -> float:
    kpis = metrics.get("kpis") or {}
    hours = _parse_hours((kpis.get("downtime_hrs") or {}).get("value"))
    if hours > 0:
        return hours
    card = metrics.get("maintenance_unplanned") or {}
    if card.get("last_shift_unplanned_hrs") is not None:
        return float(card.get("last_shift_unplanned_hrs") or 0)
    return 0.0


def _lookup_site_nested(
    root: dict[str, Any] | None,
    site: str,
) -> tuple[str | None, dict[str, Any]]:
    """Case-insensitive lookup of a site's nested dict in metrics pivots."""
    if not root or not site:
        return None, {}
    if site in root:
        return site, root[site] or {}
    site_upper = str(site).upper()
    for key, value in root.items():
        if str(key).upper() == site_upper:
            return str(key), value or {}
    return None, {}


def _sum_period_values(vals: list[Any] | None) -> float:
    clean = [
        float(v)
        for v in (vals or [])
        if v is not None and math.isfinite(float(v)) and float(v) > 0
    ]
    return round(sum(clean), 1) if clean else 0.0


def _avg_period_values(vals: list[Any] | None) -> float:
    clean = [float(v) for v in (vals or []) if v is not None and math.isfinite(float(v))]
    return round(sum(clean) / len(clean), 2) if clean else 0.0


def _resolve_site_kpis(metrics: MetricsPayload) -> dict[str, dict[str, Any]]:
    site_kpis = metrics.get("site_kpis") or {}
    if site_kpis:
        return site_kpis

    site_by_period = metrics.get("site_by_period") or {}
    site_by_period_hrs = metrics.get("site_by_period_hrs") or {}
    network_pct = _parse_pct((metrics.get("kpis") or {}).get("downtime_pct", {}).get("value"))
    network_hrs = _parse_hours((metrics.get("kpis") or {}).get("downtime_hrs", {}).get("value"))
    derived: dict[str, dict[str, Any]] = {}

    for site, period_vals in site_by_period.items():
        vals = [float(v) for v in (period_vals or []) if v is not None and math.isfinite(float(v))]
        if not vals:
            continue
        dt_pct = round(sum(vals) / len(vals), 2)
        hrs_vals = site_by_period_hrs.get(site) or []
        hrs_clean = [
            float(v) for v in hrs_vals if v is not None and math.isfinite(float(v)) and float(v) > 0
        ]
        if hrs_clean:
            dt_hrs = round(sum(hrs_clean), 1)
        elif network_pct > 0 and network_hrs > 0:
            dt_hrs = round(network_hrs * (dt_pct / network_pct), 1)
        else:
            dt_hrs = round(_estimate_sched_hours(network_hrs, network_pct) * dt_pct / 100, 1)
        derived[site] = {
            "downtime_pct": dt_pct,
            "downtime_hrs": dt_hrs,
            "stops": 0.0,
        }
    return derived


def _network_avg_dt_pct(site_kpis: dict[str, Any]) -> float:
    if not site_kpis:
        return 0.0
    values = [
        float(row.get("downtime_pct") or 0)
        for row in site_kpis.values()
        if float(row.get("downtime_pct") or 0) > 0
    ]
    return round(sum(values) / len(values), 2) if values else 0.0


def _alert_severity(site_pct: float, network_avg: float) -> str:
    delta = site_pct - network_avg
    if delta >= 3.0 or site_pct >= 10.0:
        return "Critical"
    if delta >= 1.5 or site_pct >= 7.0:
        return "High"
    return "Medium"


def _insight_severity(pct: float, target: float = DT_TARGET_PCT) -> str:
    if pct >= target + 3:
        return "critical"
    if pct >= target + 1:
        return "high"
    if pct >= target:
        return "medium"
    return "info"


def _shift_last_delta(shifts: list[dict[str, Any]]) -> dict[str, Any] | None:
    if len(shifts) < 2:
        if shifts:
            top = shifts[0]
            return {
                "shift": top.get("shift"),
                "hours": top.get("hours"),
                "delta_hours": 0.0,
                "label": "single shift in view",
            }
        return None
    ranked = sorted(shifts, key=lambda s: float(s.get("hours") or 0), reverse=True)
    top, second = ranked[0], ranked[1]
    delta = round(float(top.get("hours") or 0) - float(second.get("hours") or 0), 1)
    return {
        "shift": top.get("shift"),
        "hours": top.get("hours"),
        "vs_shift": second.get("shift"),
        "delta_hours": delta,
        "label": f"{delta:+.1f} h vs {second.get('shift')}",
    }


def _metrics_is_live(metrics: MetricsPayload) -> bool:
    src = str((metrics.get("meta") or {}).get("source") or "")
    return src in ("sql", "cache")


def _build_filter_options(metrics: MetricsPayload) -> dict[str, Any]:
    fo = metrics.get("filter_options") or {}
    live = _metrics_is_live(metrics)
    top_lines = metrics.get("top_lines") or {}
    line_keys = list(fo.get("lines") or [])
    if not line_keys and not live:
        line_keys = sorted(top_lines.keys()) if top_lines else []
        site_line = metrics.get("site_line_by_period") or {}
        if not line_keys and site_line:
            for lines in site_line.values():
                line_keys.extend(lines.keys())
            line_keys = sorted(set(line_keys))
    dept_keys = list(fo.get("departments") or [])
    if not dept_keys and not live:
        dept_keys = sorted((metrics.get("category_by_period") or {}).keys())
    shift_keys = list(fo.get("shifts") or [])
    if not shift_keys and not live:
        shift_keys = sorted(
            {
                str(s.get("shift"))
                for s in (metrics.get("shift_comparison") or [])
                if s.get("shift")
            }
        )
    sites = list(fo.get("sites") or [])
    if not sites and live:
        sites = sorted(_resolve_site_kpis(metrics).keys())
    regions = list(fo.get("regions") or [])
    years = list(fo.get("years") or [])
    if not years:
        meta_filters = (metrics.get("meta") or {}).get("filters") or {}
        y = meta_filters.get("year")
        if y:
            try:
                years = [int(str(y))]
            except ValueError:
                pass
    return {
        "sites": sites,
        "regions": regions,
        "years": years,
        "lines": line_keys,
        "site_regions": fo.get("site_regions") or {},
        "shifts": shift_keys,
        "departments": dept_keys,
    }


def _build_kpis(metrics: MetricsPayload, filters: dict[str, Any] | None) -> dict[str, Any]:
    card = metrics.get("maintenance_unplanned") or {}
    kpis = metrics.get("kpis") or {}
    dt = kpis.get("downtime_pct") or {}
    dt_hrs = kpis.get("downtime_hrs") or {}

    if card.get("current_dt_pct") is not None:
        dt_pct = _parse_pct(card.get("current_dt_pct"))
    else:
        dt_pct = _parse_pct(dt.get("value"))

    target = _resolve_unplanned_target(metrics)

    prev_period_pct = _parse_pct(card.get("prev_period_dt_pct"))
    latest_week_raw = card.get("latest_week_dt_pct")
    latest_week_pct = (
        _parse_pct(latest_week_raw) if latest_week_raw is not None else None
    )

    ytd_periods = metrics.get("ytd_periods") or []
    ytd_trend = metrics.get("ytd_period_trend") or []
    tf_key = _timeframe_key(filters, metrics)
    last_period_delta, last_period_label = _compute_last_period_delta(
        tf_key,
        dt_pct,
        prev_period_pct,
        ytd_trend,
        latest_week_pct=latest_week_pct,
    )

    delta_vs_target = round(dt_pct - target, 2)
    period_label, period_text = _period_delta_labels(filters or metrics.get("meta", {}).get("filters"))
    # Sparkline is fiscal-year-by-period only (maintenance_dt_trend_ytd) — not timeframe-scoped.
    trend_labels = ytd_periods[: len(ytd_trend)] if ytd_periods else [
        f"P{i + 1}" for i in range(len(ytd_trend))
    ]

    last_shift_pct = 0.0
    if card.get("last_shift_dt_pct") is not None:
        last_shift_pct = float(card.get("last_shift_dt_pct") or 0)

    sched_lost = float(card.get("last_shift_sched_hours") or 0)
    unplanned_shift_hrs = float(card.get("last_shift_unplanned_hrs") or 0)
    if sched_lost <= 0 and unplanned_shift_hrs > 0 and last_shift_pct > 0:
        sched_lost = _estimate_sched_hours(unplanned_shift_hrs, last_shift_pct)
    elif sched_lost <= 0 and unplanned_shift_hrs > 0:
        sched_lost = round(unplanned_shift_hrs, 1)

    if card.get("last_shift_dt_pct") is None and sched_lost > 0 and unplanned_shift_hrs > 0:
        last_shift_pct = round(unplanned_shift_hrs * 100.0 / sched_lost, 2)
        card = {**card, "last_shift_dt_pct": last_shift_pct}

    hours = _parse_hours(dt_hrs.get("value"))
    if not hours and card.get("last_shift_unplanned_hrs"):
        hours = float(card.get("last_shift_unplanned_hrs") or 0)

    tf_sched_raw = _metric_row_value(
        card,
        "current_sched_hours",
    )
    if tf_sched_raw is None:
        tf_sched_raw = _metric_row_value(
            metrics.get("kpi_raw") or {},
            "scheduled_hours",
            "current_sched_hours",
        )
    tf_sched = float(tf_sched_raw or 0)

    total_dt_pct_raw = _metric_row_value(card, "total_downtime_pct")
    if total_dt_pct_raw is None:
        total_dt_pct_raw = _metric_row_value(
            metrics.get("kpi_raw") or {},
            "total_downtime_pct",
        )
    total_dt_pct = _parse_pct(total_dt_pct_raw) if total_dt_pct_raw is not None else None
    if total_dt_pct is not None and 0 < total_dt_pct < 1.0:
        total_dt_pct = round(total_dt_pct * 100, 2)

    return {
        "primary": {
            "label": "Unplanned DT %",
            "value": dt_pct,
            "value_display": f"{dt_pct:.2f} %",
            "target": target,
            "target_display": f"{target:.2f} %",
            "delta_vs_target": delta_vs_target,
            "delta_vs_target_display": f"{abs(delta_vs_target):.2f}%",
            "last_period_delta": last_period_delta,
            "last_period_delta_display": f"{last_period_delta:+.2f}%",
            "last_period_label": last_period_label,
            "period_delta": {
                "label": period_label,
                "text": dt.get("delta") or period_label,
                "timeframe": period_text,
            },
            "trend": {
                "labels": trend_labels,
                "data": ytd_trend,
            },
            "scheduled_hours": {
                "estimate": sched_lost,
                "display": f"{sched_lost:,.1f}" if sched_lost > 0 else None,
                "method": "last_shift_scheduled_hours",
            },
            "timeframe_scheduled_hours": {
                "value": tf_sched,
                "display": f"{tf_sched:,.2f}" if tf_sched > 0 else None,
            },
            "total_downtime_pct": {
                "value": total_dt_pct if total_dt_pct is not None else None,
                "display": _format_report_pct_display(total_dt_pct),
            },
            "downtime_hours": {
                "value": hours,
                "display": dt_hrs.get("value") or f"{_locale_number(hours)} h",
            },
            "last_shift": {
                "pct": last_shift_pct if card.get("last_shift_dt_pct") is not None else None,
                "shift": card.get("last_shift_num"),
                "display": (
                    f"{float(card.get('last_shift_dt_pct')):+.2f}%"
                    if card.get("last_shift_dt_pct") is not None
                    else (f"{last_shift_pct:+.2f}%" if unplanned_shift_hrs > 0 else None)
                ),
            },
            "direction": "bad" if dt_pct > target else "good",
            "stops": {
                "value": int(str((kpis.get("stops") or {}).get("value") or "0").replace(",", "") or 0),
                "display": (kpis.get("stops") or {}).get("value") or "0",
            },
        },
    }


def _read_mtbf_measure_hrs(metrics: MetricsPayload) -> float | None:
    """Headline MTBF from SQL MEASURE(MTBF (Hours)) — not sched/stops."""
    card = metrics.get("maintenance_mtbf") or {}
    raw = _metric_row_value(card, "current_mtbf_hrs")
    if raw is None:
        return None
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None
    return val if math.isfinite(val) else None


def _build_mtbf_kpi_card(
    metrics: MetricsPayload,
    filters: dict[str, Any] | None,
) -> dict[str, Any]:
    card = metrics.get("maintenance_mtbf") or {}
    kpis = metrics.get("kpis") or {}
    measured = _read_mtbf_measure_hrs(metrics)
    value_source = "mtbf_measure"
    if measured is not None:
        mtbf = measured
    elif _metrics_is_live(metrics):
        mtbf = 0.0
        value_source = "missing"
    else:
        mtbf = 0.0
        value_source = "missing"

    target = _resolve_mtbf_target(metrics)
    prev_mtbf = float(_metric_row_value(card, "prev_period_mtbf_hrs") or 0)
    latest_week_raw = _metric_row_value(card, "latest_week_mtbf_hrs")
    latest_week = float(latest_week_raw) if latest_week_raw is not None else None

    ytd_trend = metrics.get("mtbf_ytd_period_trend") or []
    tf_key = _timeframe_key(filters, metrics)
    last_period_delta, last_period_label = _compute_last_period_delta(
        tf_key,
        mtbf,
        prev_mtbf,
        ytd_trend,
        latest_week_pct=latest_week,
    )

    delta_vs_target = round(mtbf - target, 2)
    trend_labels = _trend_labels(metrics, ytd_trend, "mtbf_ytd_periods")

    stops_val = int(
        float(
            _metric_row_value(card, "current_stops")
            or str((kpis.get("stops") or {}).get("value") or "0").replace(",", "")
            or 0
        )
    )
    mttr_raw = _metric_row_value(card, "current_mttr_hrs")
    mttr = round(float(mttr_raw or 0), 2) if mttr_raw is not None else 0.0

    last_shift_mtbf = _metric_row_value(card, "last_shift_mtbf_hrs")
    last_shift_display = None
    if last_shift_mtbf is not None:
        shift_delta = round(float(last_shift_mtbf) - mtbf, 2)
        last_shift_display = f"{shift_delta:+.2f} hrs"

    has_live = measured is not None and measured > 0
    last_period_class = (
        "bad" if last_period_delta < 0 else "good" if last_period_delta > 0 else "neutral"
    )

    return {
        "label": "Mean Time Between Failure (MTBF)",
        "value": mtbf,
        "value_display": f"{mtbf:.2f} hrs" if has_live else None,
        "value_source": value_source,
        "target": target,
        "target_display": f"{target:.2f} hrs",
        "delta_vs_target": delta_vs_target,
        "delta_vs_target_display": f"{abs(delta_vs_target):.2f}",
        "last_period_delta": last_period_delta,
        "last_period_delta_display": f"{last_period_delta:+.2f} hrs",
        "last_period_label": last_period_label,
        "last_period_class": last_period_class,
        "trend": {"labels": trend_labels, "data": ytd_trend},
        "last_shift": {"display": last_shift_display},
        "footer_right": f"{_locale_number(stops_val)} Stops / MTTR {mttr:.2f} hrs",
        "status_dot": _kpi_status_dot(mtbf, target, higher_is_better=True),
        "wip": not has_live,
    }


def _build_secondary_kpis(metrics: MetricsPayload) -> list[dict[str, Any]]:
    return [
        {
            "id": "backlog",
            "label": "% Backlog Planned Maintenance",
            "value": None,
            "target": "< 10.0 %",
            "wip": True,
        },
        {
            "id": "planned",
            "label": "Total Planned Downtime %",
            "value": None,
            "target": "3.00 %",
            "wip": True,
        },
    ]


def _severity_label(pct: float, target: float = DT_TARGET_PCT) -> str:
    if pct >= target + 3:
        return "critical"
    if pct >= target + 1:
        return "high"
    if pct >= target:
        return "medium"
    return "info"


def _business_impact_hours(dt_pct: float, dt_hrs: float, target: float = DT_TARGET_PCT) -> float:
    sched = _estimate_sched_hours(dt_hrs, dt_pct)
    if sched <= 0:
        return 0.0
    return max(0.0, sched * (dt_pct - target) / 100.0)


def _build_ai_summaries(metrics: MetricsPayload) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    dt_pct = _resolve_primary_dt_pct(metrics)
    dt_hrs = _resolve_primary_dt_hrs(metrics)
    target = _resolve_unplanned_target(metrics)
    periods = metrics.get("periods") or []
    trend = metrics.get("period_trend") or []
    shifts = metrics.get("shift_comparison") or []
    reasons = metrics.get("reasons") or []
    site_kpis = _resolve_site_kpis(metrics)
    sites_at_risk = _build_sites_at_risk(metrics)
    gap_pts = round(dt_pct - target, 2) if target > 0 else 0.0
    impact_hrs = _business_impact_hours(dt_pct, dt_hrs, target) if target > 0 else 0.0
    sched_hrs = _estimate_sched_hours(dt_hrs, dt_pct)
    target_label = f"{target:.2f}%" if target > 0 else "the operational target"

    cards: list[dict[str, Any]] = []

    overview_body = (
        f"The network is running at {dt_pct:.2f}% unplanned downtime "
        f"({_locale_number(dt_hrs)} machine hours lost), "
        f"{abs(gap_pts):.2f} percentage points {'above' if gap_pts > 0 else 'below'} "
        f"{target_label}. "
        f"Across an estimated {_locale_number(sched_hrs)} scheduled hours, "
        f"this gap represents roughly {_locale_number(impact_hrs)} recoverable production hours "
        f"if performance returns to target — equivalent to sustained capacity risk across the FLNA network."
    )
    cards.append({
        "id": "network-impact",
        "title": f"Network unplanned downtime at {dt_pct:.2f}% — business exposure",
        "timestamp": "Period to date",
        "body": overview_body,
    })

    if sites_at_risk:
        top = sites_at_risk[0]
        second = sites_at_risk[1] if len(sites_at_risk) > 1 else None
        site_body = (
            f"{top['site']} is the highest-risk site at {top['dt_pct']:.2f}% "
            f"({_locale_number(top['hours'])} unplanned DT hours on "
            f"{_locale_number(top['sched_hrs'])} scheduled hours). "
        )
        if second:
            site_body += (
                f"{second['site']} follows at {second['dt_pct']:.2f}%, "
                f"and together these sites concentrate a disproportionate share of network loss. "
            )
        site_body += (
            "Prioritizing PM and line stabilization at these sites would yield the fastest "
            "network-level recovery in unplanned downtime rate."
        )
        cards.append({
            "id": "site-risk",
            "title": f"{top['site']} drives network downtime risk",
            "timestamp": "Period to date",
            "body": site_body,
        })

    if reasons:
        top3 = reasons[:3]
        reason_hrs = sum(float(r["hours"]) for r in top3)
        reason_body = (
            f"The top three loss drivers — "
            + "; ".join(
                f"{r['reason']} ({_locale_number(r['hours'])} h, {r['pct']:.1f}%)"
                for r in top3
            )
            + f" — account for {_locale_number(reason_hrs)} hours of unplanned downtime. "
            f"{top3[0]['reason']} alone represents the largest recoverable opportunity; "
            "targeting repeat failures in this category with root-cause containment "
            "will reduce both stop frequency and hours lost per event."
        )
        cards.append({
            "id": "root-cause",
            "title": f"{top3[0]['reason']} leads network loss profile",
            "timestamp": "Period to date",
            "body": reason_body,
        })

    if trend and periods:
        peak_i = trend.index(max(trend))
        trough_i = trend.index(min(trend))
        peak_label = periods[peak_i] if peak_i < len(periods) else f"P{peak_i + 1}"
        trough_label = periods[trough_i] if trough_i < len(periods) else f"P{trough_i + 1}"
        period_body = (
            f"Unplanned downtime peaked at {peak_label} ({max(trend):.2f}%) and reached "
            f"its lowest point at {trough_label} ({min(trend):.2f}%) across the filtered horizon. "
            f"The {max(trend) - min(trend):.2f} point swing signals uneven maintenance capacity "
            "and handover effectiveness between periods. Aligning staffing and PM windows ahead of "
            f"{peak_label} would reduce the amplitude of these swings and protect service levels."
        )
        cards.append({
            "id": "period-pattern",
            "title": f"Period volatility — peak at {peak_label}",
            "timestamp": "Period to date",
            "body": period_body,
        })
    elif shifts:
        ranked = sorted(shifts, key=lambda s: float(s.get("hours") or 0), reverse=True)
        top_shift = ranked[0]
        second = ranked[1] if len(ranked) > 1 else None
        shift_body = (
            f"{top_shift.get('shift')} carries {_locale_number(top_shift.get('hours', 0))} "
            "unplanned downtime hours in the current view"
        )
        if second:
            delta = round(
                float(top_shift.get("hours") or 0) - float(second.get("hours") or 0),
                1,
            )
            shift_body += (
                f", {delta:+.1f} h above {second.get('shift')}. "
            )
        shift_body += (
            "Shift-to-shift gaps in handover discipline and PM coverage are likely amplifying "
            "losses during this window — rebalancing maintenance crew placement should reduce "
            "repeat micro-stops and extended recovery time."
        )
        cards.append({
            "id": "shift-pattern",
            "title": f"{top_shift.get('shift')} concentrates downtime hours",
            "timestamp": "Period to date",
            "body": shift_body,
        })

    action_body = (
        f"Closing the gap from {dt_pct:.2f}% to {target_label} would recover an estimated "
        f"{_locale_number(impact_hrs)} machine hours in this filter window. "
    )
    if sites_at_risk and reasons:
        action_body += (
            f"Immediate actions: (1) deploy targeted containment at {sites_at_risk[0]['site']}, "
            f"(2) address {reasons[0]['reason']} repeat failures, "
            "(3) validate PM compliance on assets with highest stop counts. "
        )
    action_body += (
        "These steps protect OEE, reduce overtime burn, and stabilize customer fill rates."
    )
    cards.append({
        "id": "recommended-actions",
        "title": "Recommended actions — quantified recovery path",
        "timestamp": "Period to date",
        "body": action_body,
    })

    return cards[:5]


def _executive_bullets_for_site(
    site: str,
    site_row: dict[str, Any],
    network_avg: float,
    reasons: list[dict[str, Any]],
    metrics: MetricsPayload,
) -> list[str]:
    dt_pct = float(site_row.get("downtime_pct") or 0)
    dt_hrs = float(site_row.get("downtime_hrs") or 0)
    sched = _estimate_sched_hours(dt_hrs, dt_pct)
    delta = round(dt_pct - network_avg, 2)
    bullets = [
        f"{site} unplanned DT is {dt_pct:.2f}% ({_locale_number(dt_hrs)} h), "
        f"{delta:+.2f} pts vs network avg {network_avg:.2f}%.",
        f"Estimated scheduled hours: {_locale_number(sched)} h "
        f"({DT_TARGET_PCT}% target would save ~{_locale_number(max(0, sched * (dt_pct - DT_TARGET_PCT) / 100))} h).",
        f"STOPS at site: {_locale_number(site_row.get('stops') or 0)} — correlate with equipment events.",
    ]
    site_lines = _lookup_site_nested(metrics.get("site_line_by_period"), site)[1]
    if site_lines:
        worst = max(site_lines.items(), key=lambda item: sum(item[1]))
        bullets.append(
            f"Top line at {site}: {worst[0]} averaging "
            f"{sum(worst[1]) / len(worst[1]):.2f}% unplanned DT across periods."
        )
    elif reasons:
        r = reasons[0]
        bullets.append(
            f"Primary reason network-wide: {r['reason']} "
            f"({_locale_number(r['hours'])} h, {r['pct']:.2f}%) — validate at {site}."
        )
    else:
        bullets.append(
            f"Close the gap to {DT_TARGET_PCT}% target with focused PM on repeat mechanical losses."
        )
    return bullets[:5]


def _worst_line_for_site(metrics: MetricsPayload, site: str) -> tuple[str, float]:
    site_lines = _lookup_site_nested(metrics.get("site_line_by_period"), site)[1]
    if site_lines:
        ranked = sorted(
            site_lines.items(),
            key=lambda item: sum(item[1]) / len(item[1]) if item[1] else 0,
            reverse=True,
        )
        if ranked:
            name, vals = ranked[0]
            avg = sum(vals) / len(vals) if vals else 0.0
            return name, round(avg, 2)
    return "", 0.0


def _build_alerts(metrics: MetricsPayload) -> list[dict[str, Any]]:
    site_kpis = _resolve_site_kpis(metrics)
    if not site_kpis:
        return []

    network_avg = _network_avg_dt_pct(site_kpis)
    reasons = metrics.get("reasons") or []
    shifts = metrics.get("shift_comparison") or []
    top_shift = max(shifts, key=lambda s: float(s.get("hours") or 0)) if shifts else None
    shift_label = str(top_shift.get("shift") or "Latest shift") if top_shift else "Latest period"
    alerts: list[dict[str, Any]] = []

    for site, row in sorted(
        site_kpis.items(),
        key=lambda item: float(item[1].get("downtime_pct") or 0),
        reverse=True,
    ):
        dt_pct = float(row.get("downtime_pct") or 0)
        if dt_pct <= network_avg:
            continue
        dt_hrs = float(row.get("downtime_hrs") or 0)
        sched = _estimate_sched_hours(dt_hrs, dt_pct)
        severity = _alert_severity(dt_pct, network_avg)
        line_name, line_pct = _worst_line_for_site(metrics, site)
        stops = int(row.get("stops") or 0)
        driver_bars = [
            {
                "reason": r["reason"],
                "hours": r["hours"],
                "pct": r["pct"],
                "stops": stops,
                "label": f"{r['reason']} ({r['pct']:.1f}%)",
            }
            for r in reasons[:5]
        ]
        line_clause = f" line {line_name}" if line_name else ""
        summary = (
            f"{site}{line_clause} recorded {dt_pct:.2f}% unplanned downtime, "
            f"accumulating {_locale_number(dt_hrs)} unplanned downtime hours across "
            f"{_locale_number(sched)} scheduled hours"
            + (f", driven by {_locale_number(stops)} line stops" if stops else "")
            + (f" concentrated in {reasons[0]['reason'].lower()}." if reasons else ".")
        )
        alerts.append({
            "site": site,
            "line": line_name,
            "title": f"Unplanned Downtime % {site} — Line {line_name}",
            "summary": summary,
            "timestamp": "Previous day",
            "severity": severity,
            "severity_rule": (
                "Critical if site DT% ≥ network avg + 3pp or ≥ 10%; "
                "High if ≥ network avg + 1.5pp or ≥ 7%; else Medium"
            ),
            "dt_pct": dt_pct,
            "downtime_hrs": dt_hrs,
            "network_avg": network_avg,
            "delta_vs_network": round(dt_pct - network_avg, 2),
            "sched_hrs": sched,
            "expandable": True,
            "detail": {
                "mini_kpis": [
                    {
                        "label": "Operational Deficit",
                        "value": f"{dt_hrs:.2f} hrs",
                        "sub": f"Unplanned Downtime Hours ({shift_label})",
                    },
                    {
                        "label": "Capacity Share",
                        "value": f"{line_pct:.2f} %",
                        "sub": f"Line {line_name} exposure",
                    },
                    {
                        "label": "Line Availability",
                        "value": f"{max(0, 100 - dt_pct):.2f} %",
                        "sub": f"-{dt_pct:.2f}% vs {100 - DT_TARGET_PCT:.1f}% target",
                    },
                    {
                        "label": "Failure Frequency",
                        "value": f"{_locale_number(stops)} Stops" if stops else "—",
                        "sub": (
                            f"MTBF: {measured:.2f} hrs"
                            if (measured := _read_mtbf_measure_hrs(metrics)) is not None
                            else "MTBF: —"
                        ),
                    },
                ],
                "driver_bars": driver_bars,
                "chart_title": f"Line {line_name}: Top Downtime Drivers Breakdown ({shift_label})",
                "executive_bullets": _executive_bullets_for_site(
                    site, row, network_avg, reasons, metrics
                ),
            },
        })
    return alerts[:8]


def _build_sites_at_risk(metrics: MetricsPayload) -> list[dict[str, Any]]:
    site_kpis = _resolve_site_kpis(metrics)
    ranked = sorted(
        site_kpis.items(),
        key=lambda item: float(item[1].get("downtime_pct") or 0),
        reverse=True,
    )[:5]
    out: list[dict[str, Any]] = []
    for site, row in ranked:
        dt_pct = float(row.get("downtime_pct") or 0)
        dt_hrs = float(row.get("downtime_hrs") or 0)
        out.append({
            "site": site,
            "dt_pct": dt_pct,
            "hours": dt_hrs,
            "sched_hrs": _estimate_sched_hours(dt_hrs, dt_pct),
        })
    return out


def _build_site_lines(metrics: MetricsPayload) -> list[dict[str, Any]]:
    """Top lines for the #1 at-risk site — only from site×line SQL pivots (no network fallback)."""
    sites_at_risk = _build_sites_at_risk(metrics)
    if not sites_at_risk:
        return []
    top_site = sites_at_risk[0]["site"]
    _, site_lines = _lookup_site_nested(metrics.get("site_line_by_period"), top_site)
    _, site_line_hrs = _lookup_site_nested(metrics.get("site_line_by_period_hrs"), top_site)
    if not site_lines:
        return []

    lines: list[tuple[str, float, float, float]] = []
    for name, vals in site_lines.items():
        hrs = _sum_period_values(site_line_hrs.get(name))
        if hrs <= 0:
            continue
        avg_pct = _avg_period_values(vals)
        sched = _estimate_sched_hours(hrs, avg_pct) if avg_pct > 0 else 0.0
        if sched > 0:
            exposure_pct = round(hrs / sched * 100.0, 2)
        else:
            exposure_pct = avg_pct
        if exposure_pct <= 0:
            continue
        lines.append((name, exposure_pct, hrs, sched))

    lines.sort(key=lambda item: item[2], reverse=True)
    out: list[dict[str, Any]] = []
    for name, pct_r, hrs, sched in lines[:5]:
        out.append({
            "site": top_site,
            "line": name,
            "dt_pct": pct_r,
            "hours": hrs,
            "sched_hrs": round(sched, 1),
        })
    return out


def _build_downtime_drivers(metrics: MetricsPayload) -> list[dict[str, Any]]:
    return [
        {
            "reason": r["reason"],
            "hours": r["hours"],
            "pct": r["pct"],
            "hours_display": f"{_locale_number(r['hours'])} h",
        }
        for r in (metrics.get("reasons") or [])
    ]


def _build_drilldown(metrics: MetricsPayload) -> list[dict[str, Any]]:
    site_kpis = _resolve_site_kpis(metrics)
    points: list[dict[str, Any]] = []
    for site, row in site_kpis.items():
        dt_pct = float(row.get("downtime_pct") or 0)
        dt_hrs = float(row.get("downtime_hrs") or 0)
        points.append({
            "site": site,
            "dt_pct": dt_pct,
            "sched_hrs": _estimate_sched_hours(dt_hrs, dt_pct),
            "hours": dt_hrs,
        })
    return sorted(points, key=lambda p: p["dt_pct"], reverse=True)


def _build_insights_bullets(metrics: MetricsPayload, target_pct: float | None = None) -> list[str]:
    """Executive-style insight bullets for My Report — template text, live metric values."""
    dt_pct = _resolve_primary_dt_pct(metrics)
    dt_hrs = _resolve_primary_dt_hrs(metrics)
    target = target_pct if target_pct is not None else _resolve_unplanned_target(metrics)
    site_kpis = _resolve_site_kpis(metrics)
    network_avg = _network_avg_dt_pct(site_kpis)
    reasons = metrics.get("reasons") or []
    sites_at_risk = _build_sites_at_risk(metrics)
    site_lines = _build_site_lines(metrics)
    trend = metrics.get("period_trend") or []
    periods = metrics.get("periods") or []
    gap = round(dt_pct - target, 2) if target > 0 else 0.0
    target_phrase = f"the {target:.2f}% target" if target > 0 else "the operational target"
    above_avg = len(
        [s for s in site_kpis.values() if float(s.get("downtime_pct") or 0) > network_avg]
    )

    bullets: list[str] = []

    if target > 0 and gap > 0:
        bullets.append(
            f"In the current view, unplanned downtime stands at {dt_pct:.2f}% "
            f"({_locale_number(dt_hrs)} hours lost)—about {abs(gap):.2f} points above "
            f"{target_phrase} and worth treating as a network priority."
        )
    elif target > 0:
        bullets.append(
            f"Unplanned downtime is {dt_pct:.2f}% ({_locale_number(dt_hrs)} hours) in this view, "
            f"{abs(gap):.2f} points below {target_phrase}. "
            "Sustain current PM and containment practices to hold the gain."
        )
    else:
        bullets.append(
            f"In the current view, unplanned downtime is {dt_pct:.2f}% "
            f"({_locale_number(dt_hrs)} hours lost) across the filtered network."
        )

    if site_kpis:
        bullets.append(
            f"The network average is {network_avg:.2f}% unplanned downtime; "
            f"{above_avg} site{'s' if above_avg != 1 else ''} {'are' if above_avg != 1 else 'is'} "
            f"running above that level and should be reviewed in the weekly maintenance cadence."
        )

    if sites_at_risk:
        top = sites_at_risk[0]
        bullets.append(
            f"{top['site']} shows the highest exposure at {top['dt_pct']:.2f}% "
            f"({_locale_number(top['hours'])} unplanned hours on "
            f"{_locale_number(top['sched_hrs'])} scheduled hours). "
            "A focused stabilization plan there will move the network fastest."
        )

    if reasons:
        lead = reasons[0]
        bullets.append(
            f"{lead['reason']} is the leading loss driver "
            f"({_locale_number(lead['hours'])} h, {lead['pct']:.1f}% of filtered unplanned downtime). "
            "Pair root-cause reviews with targeted PM on repeat mechanical and sanitation events."
        )
    elif trend and periods:
        peak_i = trend.index(max(trend))
        peak_label = periods[peak_i] if peak_i < len(periods) else f"P{peak_i + 1}"
        bullets.append(
            f"Downtime intensity peaks around {peak_label} ({max(trend):.2f}%). "
            "Align staffing and spare-parts readiness ahead of that window."
        )

    if site_lines:
        names = ", ".join(row["line"] for row in site_lines[:3])
        bullets.append(
            f"At {site_lines[0]['site']}, the highest unplanned-hour lines are {names}. "
            "Prioritize those assets for inspections and changeover standard work."
        )
    elif metrics.get("shift_comparison"):
        shifts = metrics.get("shift_comparison") or []
        top_shift = max(shifts, key=lambda s: float(s.get("hours") or 0))
        bullets.append(
            f"{top_shift.get('shift') or 'One shift'} accounts for "
            f"{_locale_number(float(top_shift.get('hours') or 0))} unplanned hours—"
            "compare shift handovers and staffing before adding capacity elsewhere."
        )
    else:
        bullets.append(
            "Use site and line drill-downs to confirm where hours concentrate before "
            "committing maintenance resources."
        )

    return bullets[:5]


def _metrics_for_timeframe(
    filters: dict[str, Any] | None,
    timeframe: str,
    fallback: MetricsPayload | None = None,
) -> MetricsPayload:
    from py_server.lib.analytics import get_cached_metrics_bundle, get_metrics_bundle

    scoped = dict(filters or {})
    scoped["timeframe"] = timeframe
    cached = get_cached_metrics_bundle(scoped)
    if cached and cached.get("kpis"):
        return cached
    try:
        return get_metrics_bundle(scoped)
    except Exception:
        if fallback is not None:
            return fallback
        raise


def build_maintenance_payload_from_filters(
    metrics: MetricsPayload,
    filters: dict[str, Any] | None,
) -> dict[str, Any]:
    alerts_m = _metrics_for_timeframe(filters, "yesterday", fallback=metrics)
    insights_m = _metrics_for_timeframe(filters, "ptd", fallback=metrics)
    return build_maintenance_payload(
        metrics,
        filters,
        alerts_metrics=alerts_m,
        insights_metrics=insights_m,
    )


def _line_loss_badge(alerts: list[dict[str, Any]], top_site: str) -> dict[str, str]:
    for alert in alerts:
        if str(alert.get("site") or "").upper() == str(top_site or "").upper():
            sev = str(alert.get("severity") or "High")
            css = sev.lower()
            if css == "critical":
                return {"label": "HIGH LOSS", "class": "critical"}
            if css == "high":
                return {"label": "HIGH LOSS", "class": "high"}
            return {"label": "ELEVATED", "class": "medium"}
    return {"label": "HIGH LOSS", "class": "critical"}


def build_maintenance_payload(
    metrics: MetricsPayload,
    filters: dict[str, Any] | None = None,
    alerts_metrics: MetricsPayload | None = None,
    insights_metrics: MetricsPayload | None = None,
) -> dict[str, Any]:
    """Build maintenance console dashboard payload from live MetricsPayload."""
    effective_filters = filters
    if not effective_filters:
        meta_filters = (metrics.get("meta") or {}).get("filters")
        if isinstance(meta_filters, dict):
            effective_filters = meta_filters

    alerts_m = alerts_metrics or metrics
    insights_m = insights_metrics or metrics
    alerts = _build_alerts(alerts_m)
    sites_at_risk = _build_sites_at_risk(metrics)
    top_site = sites_at_risk[0]["site"] if sites_at_risk else ""
    kpis_block = _build_kpis(metrics, effective_filters)
    kpis_block["mtbf"] = _build_mtbf_kpi_card(metrics, effective_filters)
    primary_target = float((kpis_block.get("primary") or {}).get("target") or 0)

    return {
        "meta": {
            **(metrics.get("meta") or {}),
            "alerts_timeframe": "yesterday",
            "insights_timeframe": "ptd",
        },
        "kpis": kpis_block,
        "secondary_kpis": _build_secondary_kpis(metrics),
        "filter_options": _build_filter_options(metrics),
        "ai_summaries": _build_ai_summaries(insights_m),
        "alerts": alerts,
        "sites_at_risk": sites_at_risk,
        "site_lines": _build_site_lines(metrics),
        "site_lines_badge": _line_loss_badge(alerts, top_site),
        "downtime_drivers": _build_downtime_drivers(metrics),
        "drilldown": _build_drilldown(metrics),
        "insights_bullets": _build_insights_bullets(metrics, target_pct=primary_target),
        "insights_meta": {
            "source": "template",
            "description": "Narrative generated server-side from live metrics payload (not Claude).",
            "metrics_source": (metrics.get("meta") or {}).get("source"),
            "target_pct": primary_target,
            "target_field": "maintenance_unplanned.ytd_target_dt_pct",
        },
    }


__all__ = [
    "DT_TARGET_PCT",
    "build_maintenance_payload",
    "build_maintenance_payload_from_filters",
]
