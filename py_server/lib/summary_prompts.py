"""Tab-specific Supervisor prompts — unplanned DT only (SC Manufacturing Console)."""
from __future__ import annotations

from typing import Any, Literal

from py_server.lib.config import resolve_metric_view

SummaryEntity = Literal['overview', 'category', 'line', 'dow', 'reason']


def _metric_view_name() -> str:
    return resolve_metric_view()


def _base_context(view: str) -> str:
    return f"""
You are the SC Manufacturing analytics supervisor agent.
Focus ONLY on UNPLANNED DOWNTIME (ignore waste metrics).
The dashboard charts and heatmaps are already loaded from SQL on: {view}
Key dimensions: Site, Region, `Line Desc`, `Downtime Category`, `Downtime Reason`, `Production Date`, `Production Period`, `Production week`, Shift, `Downtime Type`
Key measures (use MEASURE() in SQL): `Unplanned Downtime %`, `Unplanned Downtime Hours`, STOPS
Filter unplanned rows: UPPER(TRIM(`Downtime Type`)) IN ('UNPLANNED', 'UNSPECIFIED')
Use the DASHBOARD METRICS block below as the authoritative source for periods, KPIs, and peak/low periods.
Do NOT mention any Production Period that is not listed in dashboard periods.
If Genie returns periods outside the dashboard list, ignore them and use the dashboard data only.
""".strip()


TAB_QUESTIONS: dict[SummaryEntity, str] = {
    'overview': """
For the applied filters, summarize unplanned DT performance using ONLY the dashboard metrics block:
- Current Unplanned DT % and total Unplanned DT Hours
- STOPS count
- Peak and lowest period from the dashboard period_trend (not P1–P13 generically)
- One prescriptive action for plant managers

Return JSON only:
{"narrative":"2-4 sentences with exact numbers, sites, and periods from the dashboard metrics"}""",

    'category': """
For the applied filters, analyze UNPLANNED DT by `Downtime Category` using dashboard metrics:
- Top 2–3 categories by average Unplanned DT % across visible dashboard periods only
- Which Site drives the highest category downtime
- Note trend only across periods listed in the dashboard

Return JSON only:
{"narrative":"2-4 sentences naming exact categories, sites, periods, and % values from dashboard data"}""",

    'line': """
For the applied filters, analyze LINE-LEVEL unplanned DT using dashboard metrics and `Line Desc`:
- Top 3 lines by Unplanned DT % share
- Worst site/line combination across visible dashboard periods
- Specific mechanical or changeover focus area

Return JSON only:
{"narrative":"2-4 sentences naming exact line names, sites, and DT % values from dashboard data"}""",

    'dow': """
For the applied filters, analyze DAY-OF-WEEK and SHIFT patterns from dashboard metrics:
- Highest Unplanned DT % days
- Which Shift (1/2/3) drives most Unplanned DT Hours
- Week-over-week pattern using visible dashboard weeks

Return JSON only:
{"narrative":"2-4 sentences naming days, shifts, weeks, and DT % / hours from dashboard data"}""",

    'reason': """
For the applied filters, analyze ROOT CAUSES using dashboard metrics and `Downtime Reason`:
- Top 3 reasons by Unplanned DT Hours and % contribution
- Period trend using only visible dashboard periods (peak vs low)
- Priority fix ranked by hours impact

Return JSON only:
{"narrative":"2-4 sentences naming exact reasons, hours, % values, and periods from dashboard data"}""",
}


def _peak_low_from_trend(periods: list[str], trend: list[float]) -> dict[str, Any] | None:
    if not periods or not trend:
        return None
    peak_i = -1
    low_i = -1
    for i in range(min(len(periods), len(trend))):
        v = float(trend[i])
        if not (v == v and v > 0):
            continue
        if peak_i < 0 or v > float(trend[peak_i]):
            peak_i = i
        if low_i < 0 or v < float(trend[low_i]):
            low_i = i
    if peak_i < 0 or low_i < 0:
        return None
    return {
        'peakPeriod': periods[peak_i],
        'peakPct': trend[peak_i],
        'lowPeriod': periods[low_i],
        'lowPct': trend[low_i],
    }


def build_metrics_grounding_context(
    metrics: dict[str, Any] | None,
    entity_type: SummaryEntity,
) -> str:
    if not metrics or not metrics.get('periods'):
        return (
            'DASHBOARD METRICS: (not available — use Genie with applied filters; '
            'only cite periods that exist in query results)'
        )

    periods: list[str] = metrics['periods']
    trend: list[float] = metrics.get('period_trend') or []
    trend_hrs: list[float] = metrics.get('period_trend_hrs') or []
    peak_low = _peak_low_from_trend(periods, trend)
    meta = metrics.get('meta') or {}
    filters = meta.get('filters') or {}
    site = meta.get('filtered_site') or filters.get('site') or 'Network'

    lines = [
        '=== DASHBOARD METRICS (authoritative — must match UI tables/charts) ===',
        f'Site scope: {site}',
        f'Visible periods ONLY: {", ".join(periods)}',
        f'KPI Unplanned DT %: {(metrics.get("kpis") or {}).get("downtime_pct", {}).get("value", "N/A")}',
        f'KPI Unplanned DT Hours: {(metrics.get("kpis") or {}).get("downtime_hrs", {}).get("value", "N/A")}',
        f'KPI STOPS: {(metrics.get("kpis") or {}).get("stops", {}).get("value", "N/A")}',
    ]

    if peak_low:
        lines.extend([
            f'Dashboard peak period: {peak_low["peakPeriod"]} at {peak_low["peakPct"]}% DT',
            f'Dashboard lowest period: {peak_low["lowPeriod"]} at {peak_low["lowPct"]}% DT',
        ])

    period_rows = []
    for i, p in enumerate(periods):
        pct = f'{float(trend[i]):.2f}%' if i < len(trend) and trend[i] is not None else '—'
        hrs = f', {round(float(trend_hrs[i]))} h' if i < len(trend_hrs) and trend_hrs[i] is not None else ''
        period_rows.append(f'{p}: {pct}{hrs}')
    lines.append(f'period_trend: {" | ".join(period_rows)}')

    if entity_type == 'reason' and metrics.get('reasons'):
        top = [
            f'{r.get("reason")} ({r.get("hours")} h, {r.get("pct")}%)'
            for r in metrics['reasons'][:5]
        ]
        lines.append(f'Top reasons: {"; ".join(top)}')

    if entity_type == 'category' and metrics.get('category_by_period'):
        top_cats = []
        for cat, vals in metrics['category_by_period'].items():
            nums = [float(v) for v in vals if v is not None and float(v) > 0]
            avg = sum(nums) / len(nums) if nums else 0
            top_cats.append((cat, avg))
        top_cats.sort(key=lambda x: x[1], reverse=True)
        top_cats = [f'{cat} ({avg:.2f}% avg)' for cat, avg in top_cats[:3]]
        if top_cats:
            lines.append(f'Top categories (dashboard): {"; ".join(top_cats)}')

    lines.append(
        'RULE: Never mention a period label (e.g. P11) unless it appears in "Visible periods ONLY" above.',
    )
    return '\n'.join(lines)


def build_filter_context(filters: dict[str, Any]) -> str:
    parts: list[str] = []
    label_map = {
        'site': 'Site',
        'region': 'Region',
        'market': 'Market',
        'year': 'Year',
        'timeframe': 'Timeframe',
        'showIn': 'ShowIn',
        'period': 'Period',
    }
    for key, label in label_map.items():
        v = filters.get(key)
        if v is None or v == '' or str(v).lower() == 'all':
            continue
        parts.append(f'{label}={v}')
    return ', '.join(parts) if parts else 'All sites, FY 2026, all regions'


def build_supervisor_prompt(
    entity_type: SummaryEntity,
    filters: dict[str, Any],
    metrics: dict[str, Any] | None = None,
) -> str:
    view = _metric_view_name()
    ctx = build_filter_context(filters)
    grounding = build_metrics_grounding_context(metrics, entity_type)
    question = f'{_base_context(view)}\n\n{TAB_QUESTIONS[entity_type].strip()}'
    return (
        f'{question}\n\nApplied filters: {ctx}\n\n{grounding}\n'
        'Return ONLY valid JSON — no markdown fences, no text before or after.'
    )
