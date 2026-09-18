"""
Analytics — live SQL against pgt_plnt_prodtn_metric_view.
Filter changes run SQL with year/site/region bound in each query.
Only short-lived in-memory cache per filter combo — no full metric-view disk cache.
"""
from __future__ import annotations

import copy
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable

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
    apply_site_filter,
    build_metrics_from_sql,
    metrics_from_cache,
    query_result_for_key,
)

MEMORY_TTL_MS = int(os.getenv('METRICS_MEMORY_CACHE_MINUTES') or 15) * 60 * 1000

_memory_cache: dict[str, dict[str, Any]] = {}
_last_sql_error: str | None = None
_last_sql_success_at: float | None = None


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
    configured = int(os.getenv('SQL_MAX_CONCURRENCY') or 2)
    return max(1, min(batch_size, configured))


def load_metrics_from_sql(
    norm: dict[str, str | None],
    on_progress: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Run filtered SQL (year/site/region) and assemble the metrics payload."""
    global _last_sql_error, _last_sql_success_at

    if on_progress:
        on_progress('Querying KPIs, sites, and trends (wave 1/2)…')

    wave1_keys = (
        'dashboard_dt_kpis',
        'dashboard_dt_site_kpis',
        'dashboard_dt_period_trend',
        'dashboard_dt_site_by_period',
        'dashboard_dt_reasons',
        'dashboard_dt_dow',
        'dashboard_dt_top_lines',
        'dashboard_dt_shift_comparison',
        'dashboard_filter_options',
    )
    wave2_keys = (
        'dashboard_dt_category_by_period',
        'dashboard_dt_line_by_period',
        'dashboard_dt_category_network',
        'dashboard_dt_line_network',
        'dashboard_dt_dow_by_shift',
    )

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

    w1 = run_keys(wave1_keys, 'Wave 1')
    if not w1.get('dashboard_dt_kpis') and w1.get('dashboard_dt_site_kpis'):
        derived = _derive_network_kpis_from_sites(w1['dashboard_dt_site_kpis'])
        if derived:
            w1['dashboard_dt_kpis'] = derived
            print('[analytics] derived network KPIs from site_kpis (dashboard_dt_kpis query failed)', flush=True)
    if not w1.get('dashboard_dt_kpis') and not w1.get('dashboard_dt_site_kpis'):
        raise RuntimeError(
            'Critical SQL queries failed for network and site KPIs. '
            'Check Databricks warehouse capacity or retry in a moment.',
        )
    if on_progress:
        on_progress('Querying category, line, and shift breakdowns (wave 2/2)…')
    w2 = run_keys(wave2_keys, 'Wave 2')

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
    """Session memory only — keyed by SQL filters (year, site, regions)."""
    scoped = apply_site_filter(metrics, norm.get('site'))
    _set_memory_cached(norm, scoped)


def get_memory_cache_stats() -> dict[str, Any]:
    return {'entries': len(_memory_cache), 'keys': list(_memory_cache.keys())}


def warm_memory_cache_from_disk() -> int:
    """Disk metric-view cache disabled — nothing to warm."""
    return 0


def get_cached_metrics_bundle(filters: dict[str, Any] | None = None) -> dict[str, Any] | None:
    norm = normalize_params(filters or {})
    return _get_memory_cached(norm)


def get_fresh_metrics_bundle(filters: dict[str, Any] | None = None) -> dict[str, Any] | None:
    return get_cached_metrics_bundle(filters)


def refresh_metrics_bundle(
    filters: dict[str, Any],
    on_progress: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    norm = normalize_params(filters)
    metrics = load_metrics_from_sql(norm, on_progress)
    scoped = apply_site_filter(metrics, norm.get('site'))
    store_metrics_bundle_to_cache(norm, scoped)
    return scoped


def get_metrics_bundle(filters: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return metrics for the active filter selection — SQL on miss, memory on repeat."""
    norm = normalize_params(filters or {})
    mem = _get_memory_cached(norm)
    if mem:
        print(
            f'[analytics] memory cache hit filters={filter_cache_key(norm)}',
            flush=True,
        )
        return mem

    if sql_configured():
        try:
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
            cached = _get_memory_cached(norm)
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
        '_refreshing': extras.get('_refreshing', False),
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
    'get_metrics_bundle',
    'run_analytics_query',
    'metrics_bundle_to_console_payload',
    'verify_metric_view_access',
    'warmup_warehouse',
    'resolve_metric_view',
    'filter_cache_key',
    'coarse_cache_key',
]
