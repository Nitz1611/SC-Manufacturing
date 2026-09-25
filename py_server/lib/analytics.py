"""
Analytics — live SQL against pgt_plnt_prodtn_metric_view.
Filter changes run SQL with year/site/region bound in each query.
Instant serve from filter-scoped memory/disk cache; background refresh when stale.
"""
from __future__ import annotations

import copy
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable

from py_server.lib.cache import (
    FILTER_PREFIX,
    cache_get,
    cache_get_any,
    cache_load_all_metrics,
    cache_set,
)
from py_server.lib.config import (
    bind_sql_params,
    console_demo_mode,
    filter_cache_key,
    load_query_sql,
    normalize_params,
    resolve_metric_view,
)
from py_server.lib.databricks_sql import execute_statement, sql_configured, warmup_warehouse
from py_server.lib.metrics_transform import (
    apply_maintenance_kpi_sql_rows,
    apply_site_filter,
    build_core_metrics_from_sql,
    build_metrics_from_sql,
    build_tab_insights,
    metrics_from_cache,
    query_result_for_key,
)

MEMORY_TTL_MS = int(os.getenv('METRICS_MEMORY_CACHE_MINUTES') or 30) * 60 * 1000

_memory_cache: dict[str, dict[str, Any]] = {}
_load_locks: dict[str, threading.Lock] = {}
_load_locks_guard = threading.Lock()
_refresh_inflight: set[str] = set()
_extended_inflight: set[str] = set()
_last_sql_error: str | None = None
_last_sql_success_at: float | None = None

CRITICAL_QUERY_KEYS = ('dashboard_dt_kpis', 'dashboard_dt_site_kpis')
MAINTENANCE_KPI_QUERY_KEYS = (
    'maintenance_unplanned_card',
    'maintenance_dt_trend_ytd',
    'maintenance_mtbf_card',
    'maintenance_mtbf_trend_ytd',
    'maintenance_total_dt_card',
    'maintenance_total_dt_trend_ytd',
    'maintenance_dt_hours_trend_ytd',
    'maintenance_stops_trend_ytd',
)
WAVE1_CHART_KEYS = (
    'dashboard_dt_period_trend',
    'dashboard_dt_site_by_period',
    'dashboard_dt_reasons',
    'dashboard_dt_dow',
    'dashboard_dt_top_lines',
    'dashboard_dt_shift_comparison',
    'dashboard_filter_options',
    'dashboard_filter_dimensions',
    'maintenance_unplanned_card',
    'maintenance_dt_trend_ytd',
    'maintenance_mtbf_card',
    'maintenance_mtbf_trend_ytd',
    'maintenance_total_dt_card',
    'maintenance_total_dt_trend_ytd',
    'maintenance_dt_hours_trend_ytd',
    'maintenance_stops_trend_ytd',
)
WAVE2_QUERY_KEYS = (
    'dashboard_dt_category_by_period',
    'dashboard_dt_line_by_period',
    'dashboard_dt_category_network',
    'dashboard_dt_line_network',
    'dashboard_dt_dow_by_shift',
)


def databricks_configured() -> bool:
    return sql_configured()


def get_last_sql_error() -> str | None:
    return _last_sql_error


def get_last_sql_success_at() -> float | None:
    return _last_sql_success_at


def live_data_required() -> bool:
    """True when Databricks SQL is configured — demo/synthetic metrics must not be served."""
    return sql_configured()


def _metrics_source(metrics: dict[str, Any] | None) -> str:
    meta = (metrics or {}).get('meta') or {}
    return str(meta.get('source') or '')


def _is_live_metrics(metrics: dict[str, Any] | None) -> bool:
    if not metrics or not metrics.get('kpis'):
        return False
    return _metrics_source(metrics) in ('sql', 'cache')


def _allow_demo_metrics() -> bool:
    return console_demo_mode() and not live_data_required()


def _valid_sql_cache(data: dict[str, Any] | None) -> bool:
    return bool(
        data
        and data.get('kpis')
        and (data.get('meta') or {}).get('source') in ('sql', 'cache')
    )


def disk_cache_key(norm: dict[str, str | None]) -> str:
    return f'{FILTER_PREFIX}{filter_cache_key(norm)}'


def _has_extra_sql_filters(norm: dict[str, str | None]) -> bool:
    tf = str(norm.get("timeframe") or "ptd").lower()
    return bool(
        norm.get("regions")
        or norm.get("line")
        or norm.get("department")
        or norm.get("shift_filter")
        or tf not in ("ptd", "")
        or norm.get("date_from")
        or norm.get("date_to")
    )


def _read_disk_cached(norm: dict[str, str | None]) -> dict[str, Any] | None:
    cached = cache_get(disk_cache_key(norm))
    if _valid_sql_cache(cached):
        return cached
    # Site-only fallback: reuse network bundle and slice KPIs client-side (not for region/line/dept/shift).
    if norm.get('site') and not _has_extra_sql_filters(norm):
        network_norm = {**norm, 'site': None}
        cached = cache_get(disk_cache_key(network_norm))
        if _valid_sql_cache(cached):
            return cached
    return None


def _load_any_disk_cache(norm: dict[str, str | None]) -> dict[str, Any] | None:
    """Last-resort: any valid SQL cache on disk (e.g. morning data under a nearby filter key)."""
    any_data = cache_get_any()
    if _valid_sql_cache(any_data):
        print('[analytics] using last-resort disk cache entry', flush=True)
        scoped = apply_site_filter(copy.deepcopy(any_data), norm.get('site'))
        _set_memory_cached(norm, scoped)
        return scoped
    return None


def purge_non_sql_caches() -> None:
    """Drop demo/synthetic entries from memory when live SQL is required."""
    if not live_data_required():
        return
    removed = 0
    for key in list(_memory_cache.keys()):
        entry = _memory_cache.get(key)
        if entry and not _is_live_metrics(entry.get('data')):
            del _memory_cache[key]
            removed += 1
    if removed:
        print(f'[analytics] purged {removed} non-SQL memory cache entries', flush=True)


def _remember_sql_error(err: BaseException) -> None:
    global _last_sql_error
    msg = str(err) or repr(err)
    _last_sql_error = msg
    raise RuntimeError(
        f'Live SQL failed for {resolve_metric_view()}: {msg}. '
        'Set DATABRICKS_METRIC_VIEW in .env to the exact catalog.schema.view from Databricks.',
    ) from err


def _execute_query(query_key: str, params: dict[str, str | None]) -> list[dict[str, Any]]:
    print(f'[analytics] SQL start: {query_key}', flush=True)
    sql = bind_sql_params(load_query_sql(query_key), params)
    try:
        rows = execute_statement(sql)
    except Exception as err:
        raise RuntimeError(f'{query_key}: {err}') from err
    print(f'[analytics] SQL done: {query_key} ({len(rows)} rows)', flush=True)
    return rows


def _sql_max_workers(batch_size: int) -> int:
    configured = int(os.getenv('SQL_MAX_CONCURRENCY') or 1)
    return max(1, min(batch_size, configured))


def _derive_network_kpis_from_sites(site_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not site_rows:
        return []
    total_hrs = sum(float(r.get('downtime_hrs') or 0) for r in site_rows)
    total_stops = sum(float(r.get('stops') or 0) for r in site_rows)
    if total_hrs > 0:
        weighted_pct = sum(
            float(r.get('downtime_pct') or 0) * float(r.get('downtime_hrs') or 0)
            for r in site_rows
        ) / total_hrs
    else:
        weighted_pct = sum(float(r.get('downtime_pct') or 0) for r in site_rows) / len(site_rows)
    return [{
        'downtime_pct': round(weighted_pct, 2),
        'downtime_hrs': round(total_hrs, 0),
        'stops': int(round(total_stops)),
    }]


def _run_critical_queries(norm: dict[str, str | None]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Run the two KPI queries sequentially — least load on Databricks, fastest path to live KPIs."""
    kpi_rows: list[dict[str, Any]] = []
    site_rows: list[dict[str, Any]] = []
    for key in CRITICAL_QUERY_KEYS:
        try:
            rows = _execute_query(key, norm)
        except Exception as err:
            print(f'[analytics] critical {key} failed: {err}', flush=True)
            rows = []
        if key == 'dashboard_dt_kpis':
            kpi_rows = rows
        else:
            site_rows = rows
    if not kpi_rows and site_rows:
        kpi_rows = _derive_network_kpis_from_sites(site_rows)
        if kpi_rows:
            print('[analytics] derived network KPIs from site_kpis', flush=True)
    if not kpi_rows and not site_rows:
        raise RuntimeError(
            'Critical SQL queries failed for network and site KPIs. '
            'Check Databricks warehouse capacity or retry in a moment.',
        )
    return kpi_rows, site_rows


def _store_core_metrics(norm: dict[str, str | None], kpi_rows: list, site_rows: list) -> dict[str, Any]:
    partial = build_core_metrics_from_sql(kpi_rows, site_rows, norm)
    scoped = apply_site_filter(partial, norm.get('site'))
    store_metrics_bundle_to_cache(norm, scoped)
    return scoped


def load_metrics_from_sql(
    norm: dict[str, str | None],
    on_progress: Callable[[str], None] | None = None,
    *,
    cache_intermediate: bool = True,
) -> dict[str, Any]:
    """Run filtered SQL (year/site/region) and assemble the metrics payload."""
    global _last_sql_error, _last_sql_success_at

    if on_progress:
        on_progress('Querying live KPIs…')

    kpi_rows, site_rows = _run_critical_queries(norm)
    if cache_intermediate:
        _store_core_metrics(norm, kpi_rows, site_rows)
        if on_progress:
            on_progress('KPIs ready — loading charts (wave 1/2)…')

    def run_keys(keys: tuple[str, ...], wave_label: str) -> dict[str, list[dict[str, Any]]]:
        out: dict[str, list[dict[str, Any]]] = {}
        total = len(keys)
        done = 0
        workers = _sql_max_workers(total)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_execute_query, key, norm): key for key in keys}
            for fut in as_completed(futures):
                key = futures[fut]
                try:
                    out[key] = fut.result()
                except Exception as err:
                    print(f'[analytics] {key} failed: {err}', flush=True)
                    out[key] = []
                done += 1
                msg = f'{wave_label}: {done}/{total} queries complete ({key})'
                print(f'[analytics] {msg}', flush=True)
                if on_progress:
                    on_progress(msg)
        return out

    w1 = run_keys(WAVE1_CHART_KEYS, 'Wave 1')
    w1['dashboard_dt_kpis'] = kpi_rows
    w1['dashboard_dt_site_kpis'] = site_rows

    if on_progress:
        on_progress('Querying category, line, and shift breakdowns (wave 2/2)…')
    w2 = run_keys(WAVE2_QUERY_KEYS, 'Wave 2')

    results = {
        'kpis': w1['dashboard_dt_kpis'],
        'siteKpis': w1['dashboard_dt_site_kpis'],
        'periodTrend': w1['dashboard_dt_period_trend'],
        'siteByPeriod': w1['dashboard_dt_site_by_period'],
        'categoryByPeriod': w2['dashboard_dt_category_by_period'],
        'lineByPeriod': w2['dashboard_dt_line_by_period'],
        'categoryNetwork': w2['dashboard_dt_category_network'],
        'lineNetwork': w2['dashboard_dt_line_network'],
        'reasons': w1['dashboard_dt_reasons'],
        'dow': w1['dashboard_dt_dow'],
        'dowByShift': w2['dashboard_dt_dow_by_shift'],
        'topLines': w1['dashboard_dt_top_lines'],
        'shiftComparison': w1['dashboard_dt_shift_comparison'],
        'filterOptions': w1['dashboard_filter_options'],
        'filterDimensions': w1['dashboard_filter_dimensions'],
        'maintenanceUnplannedCard': w1['maintenance_unplanned_card'],
        'maintenanceDtTrendYtd': w1['maintenance_dt_trend_ytd'],
        'maintenanceMtbfCard': w1['maintenance_mtbf_card'],
        'maintenanceMtbfTrendYtd': w1['maintenance_mtbf_trend_ytd'],
        'maintenanceTotalDtCard': w1['maintenance_total_dt_card'],
        'maintenanceTotalDtTrendYtd': w1['maintenance_total_dt_trend_ytd'],
        'maintenanceDtHoursTrendYtd': w1['maintenance_dt_hours_trend_ytd'],
        'maintenanceStopsTrendYtd': w1['maintenance_stops_trend_ytd'],
    }

    metrics = build_metrics_from_sql(results, norm)
    _last_sql_error = None
    _last_sql_success_at = time.time() * 1000
    return metrics


def refresh_metrics_from_sql(
    norm: dict[str, str | None],
    on_progress: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Alias for load_metrics_from_sql — used by background refresh jobs."""
    return load_metrics_from_sql(norm, on_progress)


def _load_metrics_from_demo_fallback(filters: dict[str, Any]) -> dict[str, Any]:
    if live_data_required():
        raise RuntimeError(
            'Demo metrics are disabled while Databricks SQL is configured. '
            'Fix SQL connectivity or remove DATABRICKS_* from .env to use demo mode.',
        )
    norm = normalize_params(filters)
    return apply_site_filter(metrics_from_cache(norm), norm.get('site'))


def _get_memory_cached(norm: dict[str, str | None]) -> dict[str, Any] | None:
    key = filter_cache_key(norm)
    hit = _memory_cache.get(key)
    if not hit or (time.time() * 1000) - hit['ts'] > MEMORY_TTL_MS:
        return None
    data = hit['data']
    if live_data_required() and not _is_live_metrics(data):
        return None
    return apply_site_filter(data, norm.get('site'))


def _set_memory_cached(norm: dict[str, str | None], metrics: dict[str, Any]) -> None:
    if live_data_required() and not _is_live_metrics(metrics):
        return
    _memory_cache[filter_cache_key(norm)] = {'data': metrics, 'ts': time.time() * 1000}


def store_metrics_bundle_to_cache(
    norm: dict[str, str | None],
    metrics: dict[str, Any],
) -> None:
    """Memory + filter-scoped disk cache (one entry per year/site/regions)."""
    scoped = apply_site_filter(metrics, norm.get('site'))
    _set_memory_cached(norm, scoped)
    cache_set(disk_cache_key(norm), scoped)


def get_memory_cache_stats() -> dict[str, Any]:
    return {'entries': len(_memory_cache), 'keys': list(_memory_cache.keys())}


def warm_memory_cache_from_disk() -> int:
    loaded = 0
    for entry in cache_load_all_metrics():
        try:
            key = entry['key']
            if not key.startswith(FILTER_PREFIX):
                continue
            data = entry.get('data') or {}
            if live_data_required() and not _is_live_metrics(data):
                continue
            parsed = json.loads(key[len(FILTER_PREFIX):])
            norm: dict[str, str | None] = {
                'year': str(parsed.get('year') or '2026'),
                'site': parsed.get('site') or None,
                'regions': parsed.get('regions') or None,
                'line': parsed.get('line') or None,
                'department': parsed.get('department') or None,
                'shift_filter': parsed.get('shift') or None,
                'period': 'week',
                'timeframe': 'FY',
            }
            mem_key = filter_cache_key(norm)
            if mem_key not in _memory_cache:
                _memory_cache[mem_key] = {'data': data, 'ts': entry['ts']}
                loaded += 1
        except (json.JSONDecodeError, KeyError, TypeError):
            pass
    if loaded:
        print(f'[cache] warmed {loaded} filter-scoped bundle(s) from disk into memory', flush=True)
    return loaded


def get_cached_metrics_bundle(filters: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Memory or disk — may be stale but valid live SQL data."""
    norm = normalize_params(filters or {})
    mem = _get_memory_cached(norm)
    if mem:
        return mem
    disk = _read_disk_cached(norm)
    if disk:
        _set_memory_cached(norm, disk)
        return apply_site_filter(copy.deepcopy(disk), norm.get('site'))
    return None


def get_fresh_metrics_bundle(filters: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """In-memory only, within TTL — no background refresh needed."""
    norm = normalize_params(filters or {})
    return _get_memory_cached(norm)


def _filter_lock(norm: dict[str, str | None]) -> threading.Lock:
    key = filter_cache_key(norm)
    with _load_locks_guard:
        if key not in _load_locks:
            _load_locks[key] = threading.Lock()
        return _load_locks[key]


def _metrics_is_partial(metrics: dict[str, Any] | None) -> bool:
    meta = (metrics or {}).get('meta') or {}
    if not isinstance(meta, dict):
        return False
    return bool(meta.get('partial'))


def _needs_maintenance_kpi_enrich(metrics: dict[str, Any] | None) -> bool:
    def row_val(row: dict[str, Any] | None, *keys: str) -> Any:
        if not row:
            return None
        index = {str(k).lower(): v for k, v in row.items() if k is not None}
        for key in keys:
            if key.lower() in index and index[key.lower()] is not None:
                return index[key.lower()]
        return None

    if not metrics:
        return True
    trend = metrics.get("ytd_period_trend") or []
    unplanned = metrics.get("maintenance_unplanned") or {}
    if not trend or unplanned.get("current_dt_pct") is None:
        return True
    if not metrics.get("ytd_period_trend_hrs") or not metrics.get("ytd_stops_period_trend"):
        return True
    if row_val(unplanned, "ytd_target_dt_pct") is None:
        return True

    mtbf = metrics.get("maintenance_mtbf") or {}
    if metrics.get("mtbf_ytd_target_hrs") is None and row_val(mtbf, "ytd_target_mtbf_hrs") is None:
        return True

    total_dt = metrics.get("maintenance_total_downtime") or {}
    ytd_total = metrics.get("total_dt_ytd_target_pct")
    if ytd_total is None:
        ytd_total = row_val(total_dt, "ytd_target_total_dt_pct")
    if ytd_total is None:
        return True

    total_pct = row_val(total_dt, "current_total_dt_pct")
    if total_pct is None:
        total_pct = row_val(unplanned, "total_downtime_pct")
    if total_pct is None:
        total_pct = row_val(metrics.get("kpi_raw") or {}, "total_downtime_pct")
    if total_pct is None:
        return True

    total_trend = metrics.get("total_dt_ytd_period_trend") or []
    if not total_trend:
        return True
    if not metrics.get("ytd_period_trend_hrs"):
        return True
    if not metrics.get("ytd_stops_period_trend"):
        return True
    return False


def enrich_metrics_for_maintenance_kpis(
    metrics: dict[str, Any],
    filters: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Ensure KPI cards + YTD sparklines exist even when metrics bundle is still partial.
    Sparkline SQL intentionally ignores timeframe; headline cards use the active timeframe.
    """
    if not sql_configured() or not _needs_maintenance_kpi_enrich(metrics):
        return metrics
    norm = normalize_params(filters or {})
    m = copy.deepcopy(metrics)
    rows: dict[str, list[dict[str, Any]]] = {}
    workers = _sql_max_workers(len(MAINTENANCE_KPI_QUERY_KEYS))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_execute_query, key, norm): key for key in MAINTENANCE_KPI_QUERY_KEYS}
        for fut in as_completed(futures):
            key = futures[fut]
            try:
                rows[key] = fut.result()
            except Exception as err:
                print(f'[analytics] maintenance KPI {key} failed: {err}', flush=True)
                rows[key] = []
    apply_maintenance_kpi_sql_rows(
        m,
        maintenance_unplanned_card=rows.get('maintenance_unplanned_card'),
        maintenance_dt_trend_ytd=rows.get('maintenance_dt_trend_ytd'),
        maintenance_mtbf_card=rows.get('maintenance_mtbf_card'),
        maintenance_mtbf_trend_ytd=rows.get('maintenance_mtbf_trend_ytd'),
        maintenance_total_dt_card=rows.get('maintenance_total_dt_card'),
        maintenance_total_dt_trend_ytd=rows.get('maintenance_total_dt_trend_ytd'),
        maintenance_dt_hours_trend_ytd=rows.get('maintenance_dt_hours_trend_ytd'),
        maintenance_stops_trend_ytd=rows.get('maintenance_stops_trend_ytd'),
    )
    meta = dict(m.get('meta') or {})
    meta['maintenance_kpi_enriched'] = True
    m['meta'] = meta
    return m


def _filters_dict_from_norm(norm: dict[str, str | None]) -> dict[str, Any]:
    return {
        'year': norm.get('year') or '2026',
        'site': norm.get('site'),
        'region': norm.get('regions'),
        'line': norm.get('line'),
        'department': norm.get('department'),
        'shift': norm.get('shift_filter'),
        'timeframe': norm.get('timeframe') or 'ptd',
        'dateFrom': norm.get('date_from'),
        'dateTo': norm.get('date_to'),
    }


def schedule_extended_metrics_load(filters: dict[str, Any] | None = None) -> bool:
    """Background completion of chart queries after critical KPIs are cached."""
    if not sql_configured():
        return False
    norm = normalize_params(filters or {})
    key = filter_cache_key(norm)
    with _load_locks_guard:
        if key in _extended_inflight or key in _refresh_inflight:
            return False
        _extended_inflight.add(key)

    def _run() -> None:
        try:
            print(f'[analytics] extended load starting filters={key[:48]}…', flush=True)
            metrics = load_metrics_from_sql(norm, cache_intermediate=False)
            store_metrics_bundle_to_cache(norm, apply_site_filter(metrics, norm.get('site')))
            print(f'[analytics] extended load complete filters={key[:48]}', flush=True)
        except Exception as exc:
            print(f'[analytics] extended load failed: {exc}', flush=True)
        finally:
            with _load_locks_guard:
                _extended_inflight.discard(key)

    threading.Thread(
        target=_run,
        daemon=True,
        name=f'metrics-extended-{key[:12]}',
    ).start()
    return True


def schedule_metrics_refresh(filters: dict[str, Any] | None = None) -> bool:
    """Background SQL refresh for stale cache — skips if one is already running."""
    if not sql_configured():
        return False
    norm = normalize_params(filters or {})
    key = filter_cache_key(norm)
    with _load_locks_guard:
        if key in _refresh_inflight:
            return False
        _refresh_inflight.add(key)

    def _run() -> None:
        try:
            refresh_metrics_bundle(filters or {})
        except Exception as exc:
            print(f'[analytics] background refresh failed: {exc}', flush=True)
        finally:
            with _load_locks_guard:
                _refresh_inflight.discard(key)

    threading.Thread(target=_run, daemon=True, name=f'metrics-refresh-{key[:12]}').start()
    return True


def refresh_metrics_bundle(
    filters: dict[str, Any],
    on_progress: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    norm = normalize_params(filters)
    metrics = load_metrics_from_sql(norm, on_progress, cache_intermediate=True)
    scoped = apply_site_filter(metrics, norm.get('site'))
    store_metrics_bundle_to_cache(norm, scoped)
    return scoped


def get_metrics_bundle(
    filters: dict[str, Any] | None = None,
    *,
    fast_path: bool = True,
) -> dict[str, Any]:
    """Return metrics for the active filter selection — cache first, then SQL."""
    norm = normalize_params(filters or {})
    mem = _get_memory_cached(norm)
    if mem and not _metrics_is_partial(mem):
        print(f'[analytics] memory cache hit filters={filter_cache_key(norm)}', flush=True)
        return mem

    disk = _read_disk_cached(norm)
    if disk and not _metrics_is_partial(disk):
        print(f'[analytics] disk cache hit filters={filter_cache_key(norm)}', flush=True)
        scoped = apply_site_filter(copy.deepcopy(disk), norm.get('site'))
        _set_memory_cached(norm, scoped)
        return scoped

    if mem and _metrics_is_partial(mem):
        schedule_extended_metrics_load(_filters_dict_from_norm(norm))
        return mem

    if disk and _metrics_is_partial(disk):
        scoped = apply_site_filter(copy.deepcopy(disk), norm.get('site'))
        _set_memory_cached(norm, scoped)
        schedule_extended_metrics_load(_filters_dict_from_norm(norm))
        return scoped

    lock = _filter_lock(norm)
    with lock:
        mem = _get_memory_cached(norm)
        if mem:
            if _metrics_is_partial(mem):
                schedule_extended_metrics_load(_filters_dict_from_norm(norm))
            return mem
        disk = _read_disk_cached(norm)
        if disk:
            scoped = apply_site_filter(copy.deepcopy(disk), norm.get('site'))
            _set_memory_cached(norm, scoped)
            if _metrics_is_partial(scoped):
                schedule_extended_metrics_load(_filters_dict_from_norm(norm))
            return scoped

        if sql_configured():
            try:
                if fast_path:
                    print(
                        f'[analytics] Fast-path live KPIs for {resolve_metric_view()} '
                        f'filters={filter_cache_key(norm)}…',
                        flush=True,
                    )
                    kpi_rows, site_rows = _run_critical_queries(norm)
                    partial = _store_core_metrics(norm, kpi_rows, site_rows)
                    schedule_extended_metrics_load(_filters_dict_from_norm(norm))
                    return partial

                print(
                    f'[analytics] Loading live SQL for {resolve_metric_view()} '
                    f'filters={filter_cache_key(norm)}…',
                    flush=True,
                )
                metrics = load_metrics_from_sql(norm)
                store_metrics_bundle_to_cache(norm, metrics)
                return apply_site_filter(metrics, norm.get('site'))
            except Exception as err:
                print(f'[analytics] Live SQL failed: {err}', flush=True)
                stale = _read_disk_cached(norm) or _load_any_disk_cache(norm)
                if stale:
                    stale = copy.deepcopy(stale)
                    stale.setdefault('meta', {})['source'] = 'cache'
                    stale['meta']['sql_warning'] = str(err)[:240]
                    _set_memory_cached(norm, stale)
                    if _metrics_is_partial(stale):
                        schedule_extended_metrics_load(_filters_dict_from_norm(norm))
                    return apply_site_filter(stale, norm.get('site'))
                _remember_sql_error(err)

        if not _allow_demo_metrics():
            raise RuntimeError(
                'Live SQL is not configured. Set DATABRICKS_* in .env, '
                'or set CONSOLE_DEMO_MODE=true when SQL credentials are absent.',
            )

        demo = _load_metrics_from_demo_fallback(filters or {})
        _set_memory_cached(norm, demo)
        return demo


def run_analytics_query(
    query_key: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    global _last_sql_error, _last_sql_success_at
    norm = normalize_params(params)

    if sql_configured():
        try:
            rows = _execute_query(query_key, norm)
            _last_sql_error = None
            _last_sql_success_at = time.time() * 1000
            return {'rows': rows, 'source': 'sql', 'cached': False}
        except Exception as e:
            _last_sql_error = str(e)
            print(f'[analytics] {query_key} live SQL failed: {_last_sql_error}', flush=True)
            cached = get_cached_metrics_bundle(params)
            if cached:
                result = query_result_for_key(query_key, cached)
                row_list = result.get('rows', []) if isinstance(result, dict) else []
                if row_list:
                    return {'rows': row_list, 'source': 'cache', 'cached': True}
            raise

    if not _allow_demo_metrics():
        raise RuntimeError(
            'Live SQL is not configured. Set DATABRICKS_* in .env, '
            'or set CONSOLE_DEMO_MODE=true when SQL credentials are absent.',
        )

    metrics = _load_metrics_from_demo_fallback(params)
    result = query_result_for_key(query_key, metrics)
    row_list = result.get('rows', []) if isinstance(result, dict) else []
    return {
        'rows': row_list,
        'source': (metrics.get('meta') or {}).get('source', 'demo'),
        'cached': True,
    }


def metrics_bundle_to_console_payload(
    metrics: dict[str, Any] | None,
    extras: dict[str, Any] | None = None,
) -> dict[str, Any]:
    extras = extras or {}
    from_cache = extras.get('fromCache', extras.get('from_cache', False))
    meta = (metrics or {}).get('meta') or {}
    source = meta.get('source') or extras.get('_source') or 'loading'
    if live_data_required() and source == 'demo':
        source = 'error'
    return {
        'metrics': metrics,
        'dashboard': {},
        '_cached': from_cache or (metrics is None or meta.get('source') != 'sql'),
        '_refreshing': extras.get('_refreshing', False) or bool(meta.get('partial')),
        '_partial': bool(meta.get('partial')),
        '_job_id': extras.get('_job_id'),
        '_source': 'cache' if from_cache else source,
        '_live': _is_live_metrics(metrics),
        '_sql_warning': meta.get('sql_warning'),
    }


def verify_metric_view_access() -> dict[str, Any]:
    global _last_sql_error, _last_sql_success_at
    if not sql_configured():
        return {'ok': False, 'error': 'SQL not configured'}
    try:
        sql = f'SELECT COUNT(*) AS row_count FROM {resolve_metric_view()} LIMIT 1'
        rows = execute_statement(sql)
        _last_sql_error = None
        _last_sql_success_at = time.time() * 1000
        row_count = rows[0].get('row_count', 0) if rows else 0
        return {'ok': True, 'row_count': int(row_count or 0)}
    except Exception as e:
        _last_sql_error = str(e)
        return {'ok': False, 'error': _last_sql_error}


# Backward-compatible alias used by summaries refresh jobs.
coarse_cache_key = filter_cache_key


def warmup_default_metrics_async() -> None:
    """Background load for FY 2026 / all sites — makes first page visit instant."""
    if not sql_configured():
        return

    def _run() -> None:
        try:
            warm_memory_cache_from_disk()
            default_filters: dict[str, Any] = {'year': '2026', 'site': None, 'region': None}
            if get_fresh_metrics_bundle(default_filters):
                print('[analytics] default FY 2026 cache already warm', flush=True)
                return
            print('[analytics] warming default FY 2026 metrics in background…', flush=True)
            refresh_metrics_bundle(default_filters)
            print('[analytics] default FY 2026 metrics ready', flush=True)
        except Exception as exc:
            print(f'[analytics] default warmup failed: {exc}', flush=True)

    threading.Thread(target=_run, daemon=True, name='metrics-warmup').start()


__all__ = [
    'databricks_configured',
    'get_last_sql_error',
    'get_last_sql_success_at',
    'live_data_required',
    'purge_non_sql_caches',
    'load_metrics_from_sql',
    'refresh_metrics_from_sql',
    'store_metrics_bundle_to_cache',
    'get_memory_cache_stats',
    'warm_memory_cache_from_disk',
    'get_cached_metrics_bundle',
    'get_fresh_metrics_bundle',
    'refresh_metrics_bundle',
    'schedule_extended_metrics_load',
    'schedule_metrics_refresh',
    'get_metrics_bundle',
    'enrich_metrics_for_maintenance_kpis',
    'run_analytics_query',
    'metrics_bundle_to_console_payload',
    'verify_metric_view_access',
    'warmup_warehouse',
    'resolve_metric_view',
    'warmup_default_metrics_async',
    'filter_cache_key',
    'coarse_cache_key',
]
