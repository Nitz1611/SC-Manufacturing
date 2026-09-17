"""SQL config, query loading, and parameter binding — mirrors server/lib/config.ts."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

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
    "dtHours": "Unplanned Downtime Hours",
    "dtType": "Downtime Type",
    "stops": "STOPS",
    "site": "Site",
    "region": "Region",
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


def stops_measure() -> str:
    return _measure_expr(stops_column())


def year_filter_expression() -> str:
    return f"(:year IS NULL OR YEAR({date_column()}) = :year)"


def _apply_sql_fragments(sql: str) -> str:
    yf = year_filter_expression()
    return (
        sql.replace("{{year_filter}}", yf)
        .replace("{{period_expr}}", period_expression())
        .replace("{{period_sort}}", period_sort_column())
        .replace("{{week_expr}}", week_expression())
        .replace("{{shift_expr}}", shift_expression())
        .replace("{{date_col}}", date_column())
        .replace("{{line_col}}", line_column())
        .replace("{{category_col}}", category_column())
        .replace("{{reason_col}}", reason_column())
        .replace("{{site_col}}", site_column())
        .replace("{{region_col}}", region_column())
        .replace("{{dt_pct}}", dt_pct_column())
        .replace("{{dt_hours}}", dt_hours_column())
        .replace("{{stops_col}}", stops_column())
        .replace("{{dt_pct_m}}", dt_pct_measure())
        .replace("{{dt_hours_m}}", dt_hours_measure())
        .replace("{{stops_m}}", stops_measure())
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
    sql = re.sub(r":year\b", year_lit, sql)
    sql = re.sub(r":site\b", site_lit, sql)
    return sql.replace("{{region_filter}}", region_filter)


def _optional_filter_value(raw: dict, *keys: str) -> str | None:
    for key in keys:
        val = raw.get(key)
        if val is None:
            continue
        text = str(val).strip()
        if text and text.lower() != "all":
            return text
    return None


def normalize_params(raw: dict | None = None) -> dict[str, str | None]:
    raw = raw or {}
    timeframe = str(raw.get("timeframe") or raw.get("timeframe_mode") or "Week")
    tf_map = {
        "week": "week",
        "wtd": "week",
        "month": "month",
        "mtd": "month",
        "quarter": "quarter",
        "qtd": "quarter",
        "fy": "fiscal_year",
        "year": "fiscal_year",
        "ytd": "fiscal_year",
        "ptd": "period",
        "shift": "shift",
        "custom": "custom",
    }
    period = tf_map.get(timeframe.lower(), timeframe.lower())
    year_val = raw.get("year")
    year = str(year_val) if year_val and str(year_val).lower() != "all" else None
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
    return (os.environ.get("CONSOLE_DEMO_MODE") or "").lower() == "true"


def coarse_cache_key(params: dict[str, str | None]) -> str:
    payload = {
        "period": params.get("period") or "week",
        "timeframe": params.get("timeframe"),
        "year": params.get("year") or "2026",
        "site": params.get("site"),
        "regions": params.get("regions"),
        "line": params.get("line"),
        "department": params.get("department"),
        "shift_filter": params.get("shift_filter"),
        "date_from": params.get("date_from"),
        "date_to": params.get("date_to"),
    }
    return f"metrics_v3_{json.dumps(payload, separators=(',', ':'))}"


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
