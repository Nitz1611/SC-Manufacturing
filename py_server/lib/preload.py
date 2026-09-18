"""
Background preload — refresh all filter combinations every N minutes so
console filter changes are served instantly from memory/disk cache.
AI summaries are NOT preloaded; those always go through Supervisor on demand.
"""
from __future__ import annotations

import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, TypedDict

from py_server.lib.analytics import (
    get_fresh_metrics_bundle,
    get_memory_cache_stats,
    refresh_metrics_bundle,
    run_analytics_query,
    warm_memory_cache_from_disk,
)
from py_server.lib.databricks_sql import sql_configured
from py_server.lib.metrics_transform import build_filter_options

INTERVAL_MS = int(os.getenv('PRELOAD_INTERVAL_MINUTES') or 15) * 60 * 1000
CONCURRENCY = max(1, int(os.getenv('PRELOAD_CONCURRENCY') or 1))
DEFAULT_YEAR = os.getenv('PRELOAD_DEFAULT_YEAR') or '2026'
FULL_CYCLE_DELAY_MS = int(os.getenv('PRELOAD_FULL_DELAY_MINUTES') or 10) * 60 * 1000


def preload_enabled() -> bool:
    return (os.getenv('PRELOAD_ENABLED') or 'true').lower() != 'false'


class PreloadStatus(TypedDict):
    enabled: bool
    running: bool
    interval_minutes: float
    concurrency: int
    lastRunStartedAt: float | None
    lastRunFinishedAt: float | None
    lastRunError: str | None
    combinationsTotal: int
    combinationsDone: int
    combinationsSkipped: int
    memoryCacheEntries: int
    nextRunAt: float | None


_status: PreloadStatus = {
    'enabled': preload_enabled(),
    'running': False,
    'interval_minutes': INTERVAL_MS / 60000,
    'concurrency': CONCURRENCY,
    'lastRunStartedAt': None,
    'lastRunFinishedAt': None,
    'lastRunError': None,
    'combinationsTotal': 0,
    'combinationsDone': 0,
    'combinationsSkipped': 0,
    'memoryCacheEntries': 0,
    'nextRunAt': None,
}

_scheduler_started = False
_next_run_timer: threading.Timer | None = None
_status_lock = threading.Lock()


def _load_filter_combinations() -> list[dict[str, Any]]:
    result = run_analytics_query('dashboard_filter_options', {})
    rows = result.get('rows') or []
    options = build_filter_options(rows)
    years = [str(y) for y in options.get('years') or []] or [DEFAULT_YEAR]
    sites: list[str | None] = [None, *(options.get('sites') or [])]
    region_sets: list[list[str] | None] = [None]
    for r in options.get('regions') or []:
        region_sets.append([r])

    combos: list[dict[str, Any]] = []
    for year in years:
        for site in sites:
            for region in region_sets:
                combos.append({
                    'year': year,
                    'site': site or 'All',
                    'region': region or [],
                    'timeframe': 'FY',
                })

    def score(c: dict[str, Any]) -> int:
        s = 0
        if str(c.get('year')) == DEFAULT_YEAR:
            s += 100
        if c.get('site') == 'All':
            s += 50
        region = c.get('region')
        if not region or (isinstance(region, list) and len(region) == 0):
            s += 25
        return s

    combos.sort(key=score, reverse=True)
    return combos


def _run_pool(
    items: list[Any],
    concurrency: int,
    worker: Callable[[Any, int], None],
) -> None:
    index = 0
    index_lock = threading.Lock()

    def next_worker() -> None:
        nonlocal index
        while True:
            with index_lock:
                if index >= len(items):
                    return
                i = index
                index += 1
            worker(items[i], i)

    with ThreadPoolExecutor(max_workers=min(concurrency, len(items) or 1)) as pool:
        futures = [pool.submit(next_worker) for _ in range(min(concurrency, len(items) or 1))]
        for fut in as_completed(futures):
            fut.result()


def _default_filter_combo() -> dict[str, Any]:
    return {
        'year': DEFAULT_YEAR,
        'site': 'All',
        'region': [],
        'timeframe': 'FY',
    }


def warm_default_combo() -> None:
    """Priority warmup for FY default — keeps first page visit fast and avoids combo fan-out."""
    if not preload_enabled() or not sql_configured():
        return
    combo = _default_filter_combo()
    if get_fresh_metrics_bundle(combo):
        print('[preload] default FY combo already fresh in memory', flush=True)
        return
    try:
        print(f'[preload] warming default FY {DEFAULT_YEAR} combo…', flush=True)
        refresh_metrics_bundle(combo)
        print(f'[preload] default FY {DEFAULT_YEAR} combo ready', flush=True)
    except Exception as exc:
        print(f'[preload] default combo warmup failed: {exc}', flush=True)


def run_preload_cycle() -> None:
    global _status

    if not preload_enabled() or not sql_configured():
        return

    with _status_lock:
        if _status['running']:
            print('[preload] cycle already running — skip', flush=True)
            return
        _status['running'] = True
        _status['lastRunStartedAt'] = time.time() * 1000
        _status['lastRunError'] = None
        _status['combinationsDone'] = 0
        _status['combinationsSkipped'] = 0

    try:
        combos = _load_filter_combinations()
        with _status_lock:
            _status['combinationsTotal'] = len(combos)
        print(
            f'[preload] starting cycle — {len(combos)} combinations, concurrency={CONCURRENCY}',
            flush=True,
        )

        def worker(combo: dict[str, Any], _idx: int) -> None:
            if get_fresh_metrics_bundle(combo):
                with _status_lock:
                    _status['combinationsSkipped'] += 1
                    _status['combinationsDone'] += 1
                return
            try:
                def on_progress(msg: str) -> None:
                    with _status_lock:
                        done = _status['combinationsDone']
                    if done % 10 == 0:
                        total = _status['combinationsTotal']
                        print(f'[preload] {done}/{total} — {msg}', flush=True)

                refresh_metrics_bundle(combo, on_progress)
            except Exception as e:
                print(
                    f'[preload] combo failed: {json.dumps(combo)[:80]} {e}',
                    flush=True,
                )
            with _status_lock:
                _status['combinationsDone'] += 1

        _run_pool(combos, CONCURRENCY, worker)

        with _status_lock:
            _status['memoryCacheEntries'] = get_memory_cache_stats()['entries']
            _status['lastRunFinishedAt'] = time.time() * 1000
            started = _status['lastRunStartedAt'] or 0
            finished = _status['lastRunFinishedAt'] or 0
            elapsed = (finished - started) / 1000
            print(
                f'[preload] cycle complete — {_status["combinationsDone"]}/{_status["combinationsTotal"]} '
                f'({_status["combinationsSkipped"]} skipped fresh) in {elapsed:.0f}s, '
                f'{_status["memoryCacheEntries"]} memory keys',
                flush=True,
            )
    except Exception as e:
        with _status_lock:
            _status['lastRunError'] = str(e)
            _status['lastRunFinishedAt'] = time.time() * 1000
        print(f'[preload] cycle failed: {_status["lastRunError"]}', flush=True)
    finally:
        with _status_lock:
            _status['running'] = False
            _status['memoryCacheEntries'] = get_memory_cache_stats()['entries']
        _schedule_next_run()


def _schedule_next_run() -> None:
    global _next_run_timer

    if not _scheduler_started or not preload_enabled() or not sql_configured():
        return

    if _next_run_timer:
        _next_run_timer.cancel()

    with _status_lock:
        _status['nextRunAt'] = time.time() * 1000 + INTERVAL_MS

    def tick() -> None:
        run_preload_cycle()

    _next_run_timer = threading.Timer(INTERVAL_MS / 1000, tick)
    _next_run_timer.daemon = True
    _next_run_timer.start()


def stop_preload_scheduler() -> None:
    """Cancel scheduled preload cycles and prevent new ones until restart."""
    global _scheduler_started, _next_run_timer

    if _next_run_timer:
        _next_run_timer.cancel()
        _next_run_timer = None

    _scheduler_started = False
    with _status_lock:
        _status['enabled'] = False
        _status['nextRunAt'] = None
    print('[preload] scheduler stopped', flush=True)


def start_preload_scheduler() -> None:
    global _scheduler_started

    if _scheduler_started or not preload_enabled() or not sql_configured():
        return

    _scheduler_started = True
    with _status_lock:
        _status['enabled'] = True
    warm_memory_cache_from_disk()
    print(
        f'[preload] scheduler started — default warmup now, full cycle every '
        f'{INTERVAL_MS / 60000} min (after {FULL_CYCLE_DELAY_MS / 60000} min delay), '
        f'concurrency={CONCURRENCY}',
        flush=True,
    )

    def _boot() -> None:
        warm_default_combo()
        if FULL_CYCLE_DELAY_MS > 0:
            print(
                f'[preload] deferring full combo cycle for {FULL_CYCLE_DELAY_MS / 60000:.0f} min',
                flush=True,
            )
            time.sleep(FULL_CYCLE_DELAY_MS / 1000)
        run_preload_cycle()

    threading.Thread(target=_boot, daemon=True, name='preload-boot').start()


def get_preload_status() -> PreloadStatus:
    with _status_lock:
        return {
            **_status,
            'enabled': preload_enabled(),
            'interval_minutes': INTERVAL_MS / 60000,
            'concurrency': CONCURRENCY,
            'memoryCacheEntries': get_memory_cache_stats()['entries'],
        }
