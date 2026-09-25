"""SQL config, query loading, and parameter binding — mirrors server/lib/config.ts."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent
QUERIES_DIR = ROOT / "config" / "queries"
CACHE_FILE = ROOT / "cache.json"

GOLD_NAMES = {
    "date": "Production Date",
    "period": "Production Period",
    "week": "Production week",
    "shift": "Shift",
    "line": "Line Desc",
    "category": "Downtime Category",
    "reason": "Downtime Reason",
    "dtPct": "Unplanned Downtime %",
    "totalDtPct": "% Downtime",
    "dtHours": "Unplanned Downtime Hours",
    "dtType": "Downtime Type",
    "stops": "STOPS",
    "site": "Site",
    "region": "Region",
    "department": "Department Name",
    "scheduledHours": "Scheduled Hours",
    "mtbfHours": "MTBF (Hours)",
    "mttrHours": "MTTR (Hours)",
}


def quote_ident(name: str) -> str:
    t = name.strip()
    if not t:
        return t
    if t.startswith("`") and t.endswith("`"):
        return t
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", t):
        return t
    return "`" + t.replace("`", "``") + "`"


def _resolve_column(env_key: str, default_name: str) -> str:
    raw = (os.environ.get(env_key) or "").strip()
    if raw and ("(" in raw or re.search(r"\bCONCAT\b", raw, re.I) or re.search(r"\bCAST\b", raw, re.I)):
        return raw
    return quote_ident(raw or default_name)


def _env(key: str, default: str = "") -> str:
    return (os.environ.get(key) or default).strip()


def resolve_metric_view() -> str:
    metric_view = _env("DATABRICKS_METRIC_VIEW")
    if metric_view:
        # Whole three-part names must not be wrapped in one pair of backticks.
        if metric_view.startswith("`") and metric_view.endswith("`"):
            inner = metric_view[1:-1].strip()
            if inner.count(".") >= 2 and "`" not in inner:
                metric_view = inner
        return metric_view
    catalog = _env("DATABRICKS_CATALOG") or "main"
    schema = _env("DATABRICKS_SCHEMA")
    if schema:
        return f"{catalog}.{schema}.pgt_plnt_prodtn_metric_view"
    return f"{catalog}.pgt_plnt_prodtn_metric_view"


def date_column() -> str:
    return _resolve_column("DATABRICKS_DATE_COLUMN", GOLD_NAMES["date"])


def period_expression() -> str:
    raw = (os.environ.get("DATABRICKS_PERIOD_EXPR") or "").strip()
    if raw:
        return raw
    p = quote_ident(GOLD_NAMES["period"])
    return f"CONCAT('P', CAST({p} AS STRING))"


def period_sort_column() -> str:
    return quote_ident(GOLD_NAMES["period"])


def week_sort_column() -> str:
    return quote_ident(GOLD_NAMES["week"])


def week_expression() -> str:
    raw = (os.environ.get("DATABRICKS_WEEK_EXPR") or "").strip()
    if raw:
        return raw
    dt = date_column()
    p = quote_ident(GOLD_NAMES["period"])
    w = quote_ident(GOLD_NAMES["week"])
    return (
        f"CONCAT(CAST(YEAR({dt}) AS STRING), 'P', LPAD(CAST({p} AS STRING), 2, '0'), "
        f"'W', LPAD(CAST({w} AS STRING), 2, '0'))"
    )


def shift_expression() -> str:
    raw = (os.environ.get("DATABRICKS_SHIFT_EXPR") or "").strip()
    if raw:
        return raw
    return f"CAST({quote_ident(GOLD_NAMES['shift'])} AS STRING)"


def line_column() -> str:
    return _resolve_column("DATABRICKS_LINE_COLUMN", GOLD_NAMES["line"])


def category_column() -> str:
    return _resolve_column("DATABRICKS_CATEGORY_COLUMN", GOLD_NAMES["category"])


def reason_column() -> str:
    return _resolve_column("DATABRICKS_REASON_COLUMN", GOLD_NAMES["reason"])


def site_column() -> str:
    return _resolve_column("DATABRICKS_SITE_COLUMN", GOLD_NAMES["site"])


def region_column() -> str:
    return _resolve_column("DATABRICKS_REGION_COLUMN", GOLD_NAMES["region"])


def department_column() -> str:
    return _resolve_column("DATABRICKS_DEPARTMENT_COLUMN", GOLD_NAMES["department"])


def scheduled_hours_column() -> str:
    return _resolve_column("DATABRICKS_SCHEDULED_HOURS_COLUMN", GOLD_NAMES["scheduledHours"])


def mtbf_hours_column() -> str:
    return _resolve_column("DATABRICKS_MTBF_HOURS_COLUMN", GOLD_NAMES["mtbfHours"])


def mttr_hours_column() -> str:
    return _resolve_column("DATABRICKS_MTTR_HOURS_COLUMN", GOLD_NAMES["mttrHours"])


def _flag_filter(flag_column: str) -> str:
    return f"{quote_ident(flag_column)} = 1"


def ytd_flag_filter() -> str:
    return _flag_filter("YTD Flag")


def prev_period_flag_filter() -> str:
    return _flag_filter("Prev Period Flag")


def yesterday_flag_filter() -> str:
    return _flag_filter("Yesterday Flag")


def yesterday_slice_filter() -> str:
    """Rows for yesterday: flag column and/or calendar yesterday on Production Date."""
    override = (os.environ.get("DATABRICKS_YESTERDAY_SLICE_FILTER") or "").strip()
    if override:
        return override
    dt = date_column()
    yflag = quote_ident("Yesterday Flag")
    return f"({yflag} = 1 OR CAST({dt} AS DATE) = DATE_SUB(CURRENT_DATE(), 1))"


TIMEFRAME_FLAG_COLUMNS: dict[str, str] = {
    "ptd": "PTD Flag",
    "wtd": "WTD Flag",
    "ytd": "YTD Flag",
    "prev_week": "Prev Week Flag",
    "prev_period": "Prev Period Flag",
    "today": "Today Flag",
    "yesterday": "Yesterday Flag",
}


def build_timeframe_filter_sql(
    timeframe: str | None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> str:
    tf = str(timeframe or "ptd").strip().lower()
    if tf in ("fy", "fiscal_year", "year"):
        tf = "ytd"
    if tf == "custom":
        if date_from and date_to:
            dcol = date_column()
            esc_from = str(date_from).strip().replace("'", "''")
            esc_to = str(date_to).strip().replace("'", "''")
            return f"{dcol} >= DATE '{esc_from}' AND {dcol} <= DATE '{esc_to}'"
        return "1=1"
    flag_col = TIMEFRAME_FLAG_COLUMNS.get(tf)
    if flag_col:
        return _flag_filter(flag_col)
    return "1=1"


def _sql_string_expr(column_expr: str) -> str:
    """Expression safe for TRIM/UPPER in WHERE (handles DECIMAL dimensions like DEPT_CD)."""
    expr = column_expr.strip()
    if re.search(r"\bAS STRING\b", expr, re.I):
        return expr
    return f"CAST({expr} AS STRING)"


def build_optional_eq_filter(column_expr: str, value: str | None) -> str:
    if not value or str(value).strip().lower() in ("all", ""):
        return "1=1"
    escaped = str(value).strip().replace("'", "''")
    col = _sql_string_expr(column_expr)
    return f"UPPER(TRIM({col})) = UPPER('{escaped}')"


def build_shift_filter_sql(shift: str | None) -> str:
    if not shift or str(shift).strip().lower() in ("all", ""):
        return "1=1"
    col = _sql_string_expr(quote_ident(GOLD_NAMES["shift"]))
    raw = str(shift).strip().replace("'", "''")
    digit = re.search(r"\d+", raw)
    if digit:
        d = digit.group()
        return f"(TRIM({col}) = '{d}' OR UPPER(TRIM({col})) = UPPER('{raw}'))"
    return f"UPPER(TRIM({col})) = UPPER('{raw}')"


def build_region_filter_sql(regions_csv: str | None) -> str:
    if not regions_csv:
        return "1=1"
    col = region_column()
    parts = [
        f"'{r.strip().replace(chr(39), chr(39) * 2)}'"
        for r in regions_csv.split(",")
        if r.strip()
    ]
    if not parts:
        return "1=1"
    return f"TRIM({col}) IN ({', '.join(parts)})"


def dt_pct_column() -> str:
    return _resolve_column("DATABRICKS_DT_PCT_COLUMN", GOLD_NAMES["dtPct"])


def dt_hours_column() -> str:
    return _resolve_column("DATABRICKS_DT_HOURS_COLUMN", GOLD_NAMES["dtHours"])


def total_downtime_pct_column() -> str:
    return _resolve_column("DATABRICKS_TOTAL_DT_PCT_COLUMN", GOLD_NAMES["totalDtPct"])


def stops_column() -> str:
    return _resolve_column("DATABRICKS_STOPS_COLUMN", GOLD_NAMES["stops"])


def dt_type_filter() -> str:
    raw = (os.environ.get("DATABRICKS_DT_TYPE_FILTER") or "").strip()
    if raw:
        return raw
    col = quote_ident(GOLD_NAMES["dtType"])
    return f"UPPER(TRIM({col})) IN ('UNPLANNED', 'UNSPECIFIED')"


def dt_measure_context_filter() -> str:
    raw = (
        (os.environ.get("DATABRICKS_MEASURE_FILTER") or "").strip()
        or (os.environ.get("DATABRICKS_DT_PCT_FILTER") or "").strip()
        or (os.environ.get("DATABRICKS_DT_HOURS_FILTER") or "").strip()
    )
    return raw or "1=1"


def dt_pct_context_filter() -> str:
    return dt_measure_context_filter()


def dt_hours_context_filter() -> str:
    return dt_measure_context_filter()


def _measure_expr(column_expr: str) -> str:
    return f"MEASURE({column_expr})"


def dt_pct_measure() -> str:
    return _measure_expr(dt_pct_column())


def dt_hours_measure() -> str:
    return _measure_expr(dt_hours_column())


def total_downtime_pct_measure() -> str:
    return _measure_expr(total_downtime_pct_column())


def stops_measure() -> str:
    return _measure_expr(stops_column())


def scheduled_hours_measure() -> str:
    return _measure_expr(scheduled_hours_column())


def mtbf_hours_measure() -> str:
    return _measure_expr(mtbf_hours_column())


def mttr_hours_measure() -> str:
    return _measure_expr(mttr_hours_column())


def year_filter_expression() -> str:
    return f"(:year IS NULL OR YEAR({date_column()}) = :year)"


def _apply_sql_fragments(sql: str) -> str:
    yf = year_filter_expression()
    return (
        sql.replace("{{year_filter}}", yf)
        .replace("{{period_expr}}", period_expression())
        .replace("{{period_sort}}", period_sort_column())
        .replace("{{week_sort}}", week_sort_column())
        .replace("{{week_expr}}", week_expression())
        .replace("{{shift_expr}}", shift_expression())
        .replace("{{date_col}}", date_column())
        .replace("{{line_col}}", line_column())
        .replace("{{category_col}}", category_column())
        .replace("{{reason_col}}", reason_column())
        .replace("{{site_col}}", site_column())
        .replace("{{region_col}}", region_column())
        .replace("{{department_col}}", department_column())
        .replace("{{dt_pct}}", dt_pct_column())
        .replace("{{dt_hours}}", dt_hours_column())
        .replace("{{stops_col}}", stops_column())
        .replace("{{dt_pct_m}}", dt_pct_measure())
        .replace("{{dt_hours_m}}", dt_hours_measure())
        .replace("{{total_dt_pct_m}}", total_downtime_pct_measure())
        .replace("{{stops_m}}", stops_measure())
        .replace("{{scheduled_hours_m}}", scheduled_hours_measure())
        .replace("{{mtbf_m}}", mtbf_hours_measure())
        .replace("{{mtbf_filter}}", dt_measure_context_filter())
        .replace("{{mttr_m}}", mttr_hours_measure())
        .replace("{{mttr_filter}}", dt_measure_context_filter())
        .replace("{{ytd_flag_filter}}", ytd_flag_filter())
        .replace("{{prev_period_flag_filter}}", prev_period_flag_filter())
        .replace("{{yesterday_flag_filter}}", yesterday_flag_filter())
        .replace("{{yesterday_slice_filter}}", yesterday_slice_filter())
        .replace("{{dt_type_filter}}", dt_measure_context_filter())
        .replace("{{dt_pct_filter}}", dt_measure_context_filter())
        .replace("{{dt_hours_filter}}", dt_measure_context_filter())
        .replace("{{dt_stops_filter}}", dt_measure_context_filter())
    )


def _apply_year_filter_legacy(sql: str) -> str:
    return re.sub(
        r"\(:year IS NULL OR Year = :year\)",
        year_filter_expression(),
        sql,
        flags=re.I,
    )


def load_query_sql(query_key: str) -> str:
    file = QUERIES_DIR / f"{query_key}.obo.sql"
    if not file.is_file():
        raise FileNotFoundError(f"Query file not found: {query_key}.obo.sql")
    sql = file.read_text(encoding="utf-8")
    metric_view = resolve_metric_view()
    sql = sql.replace("{{catalog}}.pgt_plnt_prodtn_metric_view", metric_view)
    sql = sql.replace("{{catalog}}", os.environ.get("DATABRICKS_CATALOG") or "main")
    sql = _apply_year_filter_legacy(sql)
    sql = _apply_sql_fragments(sql)
    sql = re.sub(r"^--[^\n]*\n", "", sql, flags=re.MULTILINE)
    return sql.strip()


def bind_sql_params(sql: str, params: dict[str, str | None]) -> str:
    year_lit = str(params["year"]) if params.get("year") else "NULL"
    site = params.get("site")
    site_lit = f"'{site.replace(chr(39), chr(39) * 2).upper()}'" if site else "NULL"
    region_filter = build_region_filter_sql(params.get("regions"))
    line_filter = build_optional_eq_filter(line_column(), params.get("line"))
    department_filter = build_optional_eq_filter(department_column(), params.get("department"))
    shift_filter = build_shift_filter_sql(params.get("shift_filter"))
    timeframe_filter = build_timeframe_filter_sql(
        params.get("timeframe"),
        params.get("date_from"),
        params.get("date_to"),
    )
    sql = re.sub(r":year\b", year_lit, sql)
    sql = re.sub(r":site\b", site_lit, sql)
    sql = sql.replace("{{region_filter}}", region_filter)
    sql = sql.replace("{{line_filter}}", line_filter)
    sql = sql.replace("{{department_filter}}", department_filter)
    sql = sql.replace("{{shift_filter}}", shift_filter)
    sql = sql.replace("{{timeframe_filter}}", timeframe_filter)
    return sql


def _optional_filter_value(raw: dict, *keys: str) -> str | None:
    for key in keys:
        val = raw.get(key)
        if val is None:
            continue
        text = str(val).strip()
        if text and text.lower() != "all":
            return text
    return None


def _canonical_timeframe(raw: dict) -> str:
    tf = str(raw.get("timeframe") or raw.get("timeframe_mode") or "ptd").strip().lower()
    aliases = {
        "fy": "ytd",
        "fiscal_year": "ytd",
        "year": "ytd",
        "week": "wtd",
        "mtd": "ptd",
        "qtd": "ptd",
    }
    return aliases.get(tf, tf)


def normalize_params(raw: dict | None = None) -> dict[str, str | None]:
    raw = raw or {}
    timeframe = _canonical_timeframe(raw)
    tf_map = {
        "wtd": "week",
        "ytd": "fiscal_year",
        "ptd": "period",
        "prev_week": "prev_week",
        "prev_period": "prev_period",
        "today": "today",
        "yesterday": "yesterday",
        "custom": "custom",
    }
    period = tf_map.get(timeframe, timeframe)
    year_val = raw.get("year")
    if year_val and str(year_val).lower() != "all":
        year = str(year_val)
    else:
        year = "2026"
    site_val = raw.get("site")
    site = str(site_val).upper() if site_val and str(site_val).lower() != "all" else None
    regions: str | None = None
    region_val = raw.get("region")
    if isinstance(region_val, list) and region_val:
        regions = ",".join(str(r) for r in region_val)
    elif isinstance(region_val, str) and region_val.strip():
        regions = region_val.strip()
    return {
        "period": period,
        "year": year,
        "site": site,
        "timeframe": timeframe,
        "regions": regions,
        "line": _optional_filter_value(raw, "line"),
        "department": _optional_filter_value(raw, "department"),
        "shift_filter": _optional_filter_value(raw, "shift"),
        "date_from": _optional_filter_value(raw, "dateFrom", "date_from"),
        "date_to": _optional_filter_value(raw, "dateTo", "date_to"),
    }


def console_demo_mode() -> bool:
    """Demo data is only allowed when live SQL is not configured."""
    host = (
        (os.environ.get("DATABRICKS_HOST") or "")
        or (os.environ.get("DATABRICKS_SERVER_HOSTNAME") or "")
    ).strip()
    token = (
        (os.environ.get("DATABRICKS_TOKEN") or "")
        or (os.environ.get("DATABRICKS_PAT_TOKEN") or "")
    ).strip()
    warehouse = (os.environ.get("DATABRICKS_WAREHOUSE_ID") or "").strip()
    if host and token and warehouse:
        return False
    return (os.environ.get("CONSOLE_DEMO_MODE") or "").lower() == "true"


def filter_cache_key(params: dict[str, str | None]) -> str:
    """Cache key for all SQL-bound slicers including timeframe and custom dates."""
    payload = {
        "year": params.get("year") or "2026",
        "site": params.get("site"),
        "regions": params.get("regions"),
        "line": params.get("line"),
        "department": params.get("department"),
        "shift": params.get("shift_filter"),
        "timeframe": params.get("timeframe") or "ptd",
        "date_from": params.get("date_from"),
        "date_to": params.get("date_to"),
    }
    return json.dumps(payload, sort_keys=True)


def coarse_cache_key(params: dict[str, str | None]) -> str:
    """Backward-compatible alias — do not use for disk cache."""
    return filter_cache_key(params)


def sql_column_summary() -> dict[str, str]:
    return {
        "date_column": date_column(),
        "period_expr": period_expression(),
        "week_expr": week_expression(),
        "dt_pct": dt_pct_column(),
        "dt_hours": dt_hours_column(),
        "line": line_column(),
        "category": category_column(),
        "reason": reason_column(),
        "site": site_column(),
        "region": region_column(),
    }
