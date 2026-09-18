"""Maintenance console payload builder — derived from MetricsPayload."""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from py_server.lib.metrics_transform import MetricsPayload, build_tab_insights

DT_TARGET_PCT = 4.5

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
    return round(dt_hrs * 100.0 / dt_pct)


def _period_delta_labels(filters: dict[str, Any] | None) -> tuple[str, str]:
    filters = filters or {}
    tf = str(
        filters.get("timeframe")
        or filters.get("timeframe_mode")
        or (filters.get("meta") or {}).get("filters", {}).get("timeframe")
        or "FY"
    ).lower()
    return PERIOD_DELTA_MAP.get(tf, ("vs prior period", tf.upper()))


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


def _build_filter_options(metrics: MetricsPayload) -> dict[str, Any]:
    fo = metrics.get("filter_options") or {}
    top_lines = metrics.get("top_lines") or {}
    line_keys = sorted(top_lines.keys()) if top_lines else []
    site_line = metrics.get("site_line_by_period") or {}
    if not line_keys and site_line:
        for lines in site_line.values():
            line_keys.extend(lines.keys())
        line_keys = sorted(set(line_keys))
    return {
        "sites": fo.get("sites") or [],
        "regions": fo.get("regions") or [],
        "years": fo.get("years") or [],
        "lines": line_keys,
        "site_regions": fo.get("site_regions") or {},
        "shifts": sorted(
            {
                str(s.get("shift"))
                for s in (metrics.get("shift_comparison") or [])
                if s.get("shift")
            }
        ),
        "departments": sorted((metrics.get("category_by_period") or {}).keys()),
    }


def _build_kpis(metrics: MetricsPayload, filters: dict[str, Any] | None) -> dict[str, Any]:
    kpis = metrics.get("kpis") or {}
    dt = kpis.get("downtime_pct") or {}
    dt_hrs = kpis.get("downtime_hrs") or {}
    dt_pct = _parse_pct(dt.get("value"))
    hours = _parse_hours(dt_hrs.get("value"))
    target = DT_TARGET_PCT
    delta_vs_target = round(dt_pct - target, 2)
    period_label, period_text = _period_delta_labels(filters or metrics.get("meta", {}).get("filters"))
    periods = metrics.get("periods") or []
    trend = metrics.get("period_trend") or []
    trend_labels = periods[: len(trend)] if periods else [f"P{i + 1}" for i in range(len(trend))]
    sched_hrs = _estimate_sched_hours(hours, dt_pct)
    shift_delta = _shift_last_delta(metrics.get("shift_comparison") or [])

    return {
        "primary": {
            "label": "Unplanned DT %",
            "value": dt_pct,
            "value_display": dt.get("value") or f"{dt_pct:.2f}%",
            "target": target,
            "delta_vs_target": delta_vs_target,
            "delta_vs_target_display": f"{delta_vs_target:+.2f} pts vs target",
            "period_delta": {
                "label": period_label,
                "text": dt.get("delta") or period_label,
                "timeframe": period_text,
            },
            "trend": {
                "labels": trend_labels,
                "data": trend,
            },
            "scheduled_hours": {
                "estimate": sched_hrs,
                "display": f"{_locale_number(sched_hrs)} h",
                "method": "dt_hours / dt_pct",
            },
            "downtime_hours": {
                "value": hours,
                "display": dt_hrs.get("value") or f"{_locale_number(hours)} h",
            },
            "last_shift": shift_delta,
            "direction": dt.get("direction") or ("bad" if dt_pct > target else "good"),
            "stops": {
                "value": int(str((kpis.get("stops") or {}).get("value") or "0").replace(",", "") or 0),
                "display": (kpis.get("stops") or {}).get("value") or "0",
            },
        },
    }


def _build_secondary_kpis(metrics: MetricsPayload) -> list[dict[str, Any]]:
    site_kpis = _resolve_site_kpis(metrics)
    stops_total = sum(int(row.get("stops") or 0) for row in site_kpis.values())
    dt_hrs = _parse_hours((metrics.get("kpis") or {}).get("downtime_hrs", {}).get("value"))
    sched = _estimate_sched_hours(
        dt_hrs,
        _parse_pct((metrics.get("kpis") or {}).get("downtime_pct", {}).get("value")),
    )
    mtbf_hrs = round(sched / max(stops_total, 1), 2) if sched and stops_total else None
    return [
        {
            "id": "backlog",
            "label": "% Backlog Planned Maintenance",
            "value": None,
            "target": "< 10.0 %",
            "wip": True,
        },
        {
            "id": "mtbf",
            "label": "Mean Time Between Failure (MTBF)",
            "value": f"{mtbf_hrs:.2f} hrs" if mtbf_hrs else None,
            "target": "12.00 hrs",
            "wip": not mtbf_hrs,
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
    kpis = metrics.get("kpis") or {}
    dt_pct = _parse_pct((kpis.get("downtime_pct") or {}).get("value"))
    dt_hrs = _parse_hours((kpis.get("downtime_hrs") or {}).get("value"))
    periods = metrics.get("periods") or []
    trend = metrics.get("period_trend") or []
    shifts = metrics.get("shift_comparison") or []
    reasons = metrics.get("reasons") or []
    site_kpis = _resolve_site_kpis(metrics)
    sites_at_risk = _build_sites_at_risk(metrics)
    gap_pts = round(dt_pct - DT_TARGET_PCT, 2)
    impact_hrs = _business_impact_hours(dt_pct, dt_hrs)
    sched_hrs = _estimate_sched_hours(dt_hrs, dt_pct)

    cards: list[dict[str, Any]] = []

    overview_body = (
        f"The network is running at {dt_pct:.2f}% unplanned downtime "
        f"({_locale_number(dt_hrs)} machine hours lost), "
        f"{abs(gap_pts):.2f} percentage points {'above' if gap_pts > 0 else 'below'} "
        f"the {DT_TARGET_PCT:.2f}% operational target. "
        f"Across an estimated {_locale_number(sched_hrs)} scheduled hours, "
        f"this gap represents roughly {_locale_number(impact_hrs)} recoverable production hours "
        f"if performance returns to target — equivalent to sustained capacity risk across the FLNA network."
    )
    cards.append({
        "id": "network-impact",
        "severity": _severity_label(dt_pct),
        "title": f"Network unplanned downtime at {dt_pct:.2f}% — business exposure",
        "timestamp": now,
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
            "severity": _severity_label(float(top["dt_pct"])),
            "title": f"{top['site']} drives network downtime risk",
            "timestamp": now,
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
            "severity": _severity_label(dt_pct),
            "title": f"{top3[0]['reason']} leads network loss profile",
            "timestamp": now,
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
            "severity": _severity_label(max(trend)),
            "title": f"Period volatility — peak at {peak_label}",
            "timestamp": now,
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
            "severity": "medium",
            "title": f"{top_shift.get('shift')} concentrates downtime hours",
            "timestamp": now,
            "body": shift_body,
        })

    action_body = (
        f"Closing the gap from {dt_pct:.2f}% to {DT_TARGET_PCT:.2f}% would recover an estimated "
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
        "severity": _severity_label(dt_pct),
        "title": "Recommended actions — quantified recovery path",
        "timestamp": now,
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
    site_lines = (metrics.get("site_line_by_period") or {}).get(site) or {}
    if site_lines:
        worst = max(site_lines.items(), key=lambda item: sum(item[1]))
        bullets.append(
            f"Top line at {site}: {worst[0]} averaging "
            f"{sum(worst[1]) / len(worst[1]):.2f}% unplanned DT across periods."
        )
    else:
        top_lines = metrics.get("top_lines") or {}
        if top_lines:
            line_name, line_pct = max(top_lines.items(), key=lambda item: item[1])
            bullets.append(f"Network line hotspot: {line_name} at {line_pct:.1f}% share.")

    if reasons:
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
    site_lines = (metrics.get("site_line_by_period") or {}).get(site) or {}
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
    top_lines = metrics.get("top_lines") or {}
    if top_lines:
        name, pct = max(top_lines.items(), key=lambda item: item[1])
        return name, float(pct)
    return "Network", 0.0


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
        summary = (
            f"{site} line {line_name} recorded {dt_pct:.2f}% unplanned downtime, "
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
            "timestamp": f"{shift_label} (recent)",
            "severity": severity,
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
                        "sub": f"MTBF: {round(sched / max(stops, 1), 2)} hrs" if sched else "",
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
    sites_at_risk = _build_sites_at_risk(metrics)
    if not sites_at_risk:
        return []
    top_site = sites_at_risk[0]["site"]
    top_lines = metrics.get("top_lines") or {}
    site_lines = (metrics.get("site_line_by_period") or {}).get(top_site) or {}

    lines: list[tuple[str, float]] = []
    if site_lines:
        lines = [
            (name, sum(vals) / len(vals) if vals else 0.0)
            for name, vals in site_lines.items()
        ]
    elif top_lines:
        lines = list(top_lines.items())

    lines.sort(key=lambda item: item[1], reverse=True)
    return [
        {
            "site": top_site,
            "line": name,
            "dt_pct": round(pct, 2),
        }
        for name, pct in lines[:5]
    ]


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


def _build_insights_bullets(metrics: MetricsPayload) -> list[str]:
    kpis = metrics.get("kpis") or {}
    dt_pct = _parse_pct((kpis.get("downtime_pct") or {}).get("value"))
    dt_hrs = _parse_hours((kpis.get("downtime_hrs") or {}).get("value"))
    site_kpis = _resolve_site_kpis(metrics)
    network_avg = _network_avg_dt_pct(site_kpis)
    reasons = metrics.get("reasons") or []
    sites_at_risk = _build_sites_at_risk(metrics)
    tab = build_tab_insights(metrics)
    trend = metrics.get("period_trend") or []
    periods = metrics.get("periods") or []

    bullets = [
        f"Network unplanned DT: {dt_pct:.2f}% ({_locale_number(dt_hrs)} h) "
        f"vs {DT_TARGET_PCT}% target ({dt_pct - DT_TARGET_PCT:+.2f} pts).",
        f"Site average: {network_avg:.2f}% — "
        f"{len([s for s in site_kpis.values() if float(s.get('downtime_pct') or 0) > network_avg])} "
        "sites above average.",
    ]
    if sites_at_risk:
        top = sites_at_risk[0]
        bullets.append(
            f"Highest-risk site: {top['site']} at {top['dt_pct']:.2f}% "
            f"({_locale_number(top['hours'])} h)."
        )
    if reasons:
        top3 = reasons[:3]
        bullets.append(
            "Top drivers: "
            + "; ".join(f"{r['reason']} ({r['pct']:.1f}%)" for r in top3)
            + "."
        )
    elif metrics.get("category_by_period"):
        top_cat = max(
            (metrics.get("category_by_period") or {}).items(),
            key=lambda item: sum(item[1]),
        )
        bullets.append(
            f"Leading category: {top_cat[0]} "
            f"({sum(top_cat[1]) / len(top_cat[1]):.2f}% avg across periods)."
        )
    bullets.append(tab.get("line") or "Review line heatmap for asset-level focus.")
    bullets.append(tab.get("dow") or "Compare shift patterns to schedule PM windows.")
    if trend and periods:
        peak_i = trend.index(max(trend))
        peak_label = periods[peak_i] if peak_i < len(periods) else f"P{peak_i + 1}"
        bullets.append(
            f"Period trend peaks at {peak_label} ({max(trend):.2f}%) — "
            "align maintenance capacity ahead of that window."
        )
    elif tab.get("reason"):
        bullets.append(tab["reason"])
    else:
        bullets.append(
            f"Estimated scheduled hours: {_locale_number(_estimate_sched_hours(dt_hrs, dt_pct))} h "
            "across the filtered network view."
        )
    while len(bullets) < 5:
        bullets.append(tab.get("overview") or f"Maintain focus on closing the gap to {DT_TARGET_PCT}% target.")
    return bullets


def build_maintenance_payload(
    metrics: MetricsPayload,
    filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build maintenance console dashboard payload from live MetricsPayload."""
    effective_filters = filters
    if not effective_filters:
        meta_filters = (metrics.get("meta") or {}).get("filters")
        if isinstance(meta_filters, dict):
            effective_filters = meta_filters

    return {
        "meta": metrics.get("meta") or {},
        "kpis": _build_kpis(metrics, effective_filters),
        "secondary_kpis": _build_secondary_kpis(metrics),
        "filter_options": _build_filter_options(metrics),
        "ai_summaries": _build_ai_summaries(metrics),
        "alerts": _build_alerts(metrics),
        "sites_at_risk": _build_sites_at_risk(metrics),
        "site_lines": _build_site_lines(metrics),
        "downtime_drivers": _build_downtime_drivers(metrics),
        "drilldown": _build_drilldown(metrics),
        "insights_bullets": _build_insights_bullets(metrics),
    }


__all__ = [
    "DT_TARGET_PCT",
    "build_maintenance_payload",
]
