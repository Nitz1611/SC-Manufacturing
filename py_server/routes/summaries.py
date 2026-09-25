"""Summary and console-data routes — mirrors server/routes/summaries.ts."""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Any

from flask import Blueprint, jsonify, request

from py_server.lib.analytics import (
    enrich_metrics_for_maintenance_kpis,
    get_cached_metrics_bundle,
    get_fresh_metrics_bundle,
    get_metrics_bundle,
    metrics_bundle_to_console_payload,
    schedule_extended_metrics_load,
    schedule_metrics_refresh,
)
from py_server.lib.claude_summary import claude_status, get_claude_batch_summaries, get_claude_tab_summary
from py_server.lib.config import coarse_cache_key, console_demo_mode, normalize_params, resolve_metric_view
from py_server.lib.databricks_fetch import test_databricks_reachability
from py_server.lib.databricks_sql import sql_configured
from py_server.lib.jobs import (
    create_job,
    fail_job,
    finish_job,
    new_job_id,
    update_job_message,
)
from py_server.lib.metrics_transform import build_tab_insights
from py_server.lib.preload import get_preload_status, preload_enabled
from py_server.lib.summary_prompts import SummaryEntity
from py_server.lib.summary_provider import (
    allow_template_fallback,
    describe_summary_provider,
    is_fallback_summary_source,
    resolve_summary_provider,
    summary_provider_label,
)
from py_server.lib.supervisor import get_all_supervisor_summaries, get_supervisor_summary

SUMMARY_TABS: list[SummaryEntity] = ['overview', 'category', 'line', 'dow', 'reason']
VALID_ENTITY_TYPES = set(SUMMARY_TABS)

_summary_cache: dict[str, dict[str, Any]] = {}
SUMMARY_TTL_MS = int(os.getenv('SUMMARY_CACHE_TTL_HOURS') or 24) * 3600 * 1000

bp = Blueprint('summaries', __name__)


def _summary_cache_key(entity_type: str, params: dict[str, Any]) -> str:
    return f'{entity_type}:{json.dumps(params, sort_keys=True)}'


def _filters_from_params(params: dict[str, Any]) -> dict[str, Any]:
    return {
        'showIn': params.get('showIn'),
        'timeframe': params.get('timeframe') or params.get('timeframe_mode') or 'FY',
        'year': params.get('year'),
        'site': params.get('site'),
        'region': params.get('region'),
        'period': params.get('period'),
    }


def _fallback_narrative(entity_type: SummaryEntity, params: dict[str, Any]) -> str:
    metrics = get_metrics_bundle(params)
    tab_insights = (metrics.get('tab_insights') or {}).get(entity_type)
    if tab_insights:
        return tab_insights
    return build_tab_insights(metrics).get(entity_type, '')


def _metrics_for_summaries(params: dict[str, Any]) -> dict[str, Any]:
    cached = get_cached_metrics_bundle(params)
    return cached if cached else get_metrics_bundle(params)


def _cached_batch_summaries(
    params: dict[str, Any],
    provider: str,
) -> dict[str, str] | None:
    summaries = {
        tab: (_summary_cache.get(_summary_cache_key(tab, params)) or {}).get('narrative', '')
        for tab in SUMMARY_TABS
    }
    if not all(summaries.values()):
        return None

    first_hit = _summary_cache.get(_summary_cache_key(SUMMARY_TABS[0], params))
    if first_hit and is_fallback_summary_source(first_hit.get('source')) and provider != 'template':
        for tab in SUMMARY_TABS:
            _summary_cache.pop(_summary_cache_key(tab, params), None)
        return None

    return summaries


def _store_batch_summaries(params: dict[str, Any], summaries: dict[str, str], source: str) -> None:
    if is_fallback_summary_source(source):
        return
    now = time.time() * 1000
    for tab, narrative in summaries.items():
        if narrative:
            _summary_cache[_summary_cache_key(tab, params)] = {
                'narrative': narrative,
                'source': source,
                'ts': now,
            }


def _generate_batch_summaries(
    provider: str,
    filters: dict[str, Any],
    params: dict[str, Any],
) -> dict[str, str]:
    metrics = _metrics_for_summaries(params)

    if provider == 'claude':
        return get_claude_batch_summaries(filters, metrics)
    if provider == 'supervisor':
        return get_all_supervisor_summaries(filters, metrics)

    return metrics.get('tab_insights') or build_tab_insights(metrics)


def _run_background(fn) -> None:
    thread = threading.Thread(target=fn, daemon=True)
    thread.start()


@bp.get('/summaries/status')
def summaries_status():
    connectivity = test_databricks_reachability()
    return jsonify({
        'ok': True,
        **describe_summary_provider(),
        'claude': claude_status(),
        'connectivity': connectivity,
    })


@bp.post('/summaries')
def single_summary():
    body = request.get_json(silent=True) or {}
    entity_type = body.get('entityType')
    if entity_type not in VALID_ENTITY_TYPES:
        return jsonify({'error': 'entityType must be one of: overview, category, line, dow, reason'}), 400

    params = body.get('params') or {}
    force_refresh = bool(body.get('forceRefresh'))
    cache_key = _summary_cache_key(entity_type, params)
    provider = resolve_summary_provider()

    if not force_refresh:
        hit = _summary_cache.get(cache_key)
        if hit and time.time() * 1000 - hit['ts'] < SUMMARY_TTL_MS:
            if not (is_fallback_summary_source(hit.get('source')) and provider != 'template'):
                return jsonify({
                    'narrative': hit['narrative'],
                    'cached': True,
                    'entityType': entity_type,
                    'source': hit['source'],
                    'provider': provider,
                })

    try:
        filters = _filters_from_params(params)
        metrics = _metrics_for_summaries(params)
        narrative: str
        source: str

        if provider == 'claude':
            result = get_claude_tab_summary(entity_type, filters, metrics)
            narrative = result['narrative']
            source = result['source']
        elif provider == 'supervisor':
            result = get_supervisor_summary(entity_type, filters, metrics)
            narrative = result['narrative']
            source = result['source']
        else:
            narrative = _fallback_narrative(entity_type, params)
            source = 'template'

        if not is_fallback_summary_source(source):
            _summary_cache[cache_key] = {
                'narrative': narrative,
                'source': source,
                'ts': time.time() * 1000,
            }
        return jsonify({
            'narrative': narrative,
            'cached': False,
            'entityType': entity_type,
            'source': source,
            'provider': provider,
        })
    except Exception as e:
        if provider in ('claude', 'supervisor') and not allow_template_fallback():
            return jsonify({
                'error': str(e),
                'entityType': entity_type,
                'provider': provider,
                'source': 'error',
            }), 502
        try:
            narrative = _fallback_narrative(entity_type, params)
            return jsonify({
                'narrative': narrative,
                'cached': False,
                'entityType': entity_type,
                'source': 'template-fallback',
                'provider': provider,
                'warning': str(e),
            })
        except Exception as inner:
            return jsonify({'error': str(inner)}), 500


@bp.post('/summaries/batch')
def batch_summaries():
    body = request.get_json(silent=True) or {}
    params = body.get('params') or {}
    force_refresh = bool(body.get('forceRefresh'))
    filters = _filters_from_params(params)
    provider = resolve_summary_provider()

    if not force_refresh:
        cached = _cached_batch_summaries(params, provider)
        if cached:
            first_hit = _summary_cache[_summary_cache_key(SUMMARY_TABS[0], params)]
            return jsonify({
                'summaries': cached,
                'cached': True,
                'source': first_hit['source'],
                'provider': provider,
                '_job_id': None,
            })

    if provider == 'template':
        try:
            metrics = get_metrics_bundle(params)
            template_insights = metrics.get('tab_insights') or build_tab_insights(metrics)
            return jsonify({
                'summaries': template_insights,
                'cached': False,
                'source': 'template',
                'provider': provider,
                'warning': describe_summary_provider()['reason'],
                '_job_id': None,
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    job_id = new_job_id()
    create_job(job_id, 'Generating AI summaries…' if provider == 'claude' else 'Connecting to Supervisor…')

    def _run_batch() -> None:
        try:
            print(f'[job {job_id[:8]}] Starting {provider} batch…', flush=True)
            summaries = _generate_batch_summaries(provider, filters, params)
            source = summary_provider_label(provider)
            _store_batch_summaries(params, summaries, source)
            finish_job(job_id, {'summaries': summaries, 'source': source})
            count = sum(1 for v in summaries.values() if v)
            print(f'[job {job_id[:8]}] Done — {count} tabs', flush=True)
        except Exception as e:
            message = str(e)
            if not allow_template_fallback():
                fail_job(job_id, message)
                print(f'[job {job_id[:8]}] {provider} failed: {message}', flush=True)
                return
            try:
                metrics = _metrics_for_summaries(params)
                template_insights = metrics.get('tab_insights') or build_tab_insights(metrics)
                finish_job(job_id, {
                    'summaries': template_insights,
                    'source': 'template-fallback',
                    'warning': message,
                })
                print(f'[job {job_id[:8]}] {provider} failed — template fallback: {message}', flush=True)
            except Exception:
                fail_job(job_id, message)
                print(f'[job {job_id[:8]}] Failed: {message}', flush=True)

    _run_background(_run_batch)

    return jsonify({
        '_job_id': job_id,
        '_cached': False,
        'status': 'running',
        'provider': provider,
        'source': summary_provider_label(provider),
    })


@bp.get('/preload/status')
def preload_status():
    return jsonify(get_preload_status())


@bp.post('/console-data')
def console_data():
    body = request.get_json(silent=True) or {}
    filters = body.get('filters') or {}
    force = bool(body.get('force'))

    def _with_kpi_ytd_trends(bundle: dict[str, Any] | None) -> dict[str, Any] | None:
        if not bundle or not sql_configured():
            return bundle
        return enrich_metrics_for_maintenance_kpis(bundle, filters)

    if not force:
        cached = get_cached_metrics_bundle(filters)
        if cached and cached.get('kpis'):
            cached = _with_kpi_ytd_trends(cached) or cached
            meta = cached.get('meta') or {}
            partial = bool(meta.get('partial'))
            if partial:
                schedule_extended_metrics_load(filters)
            elif not get_fresh_metrics_bundle(filters) and sql_configured():
                schedule_metrics_refresh(filters)
            payload = metrics_bundle_to_console_payload(cached, {
                'fromCache': True,
                '_refreshing': partial,
            })
            return jsonify(payload)

    if not console_demo_mode() and not sql_configured():
        return jsonify({
            'error': (
                'Live SQL is not configured. Set DATABRICKS_* in .env, '
                'or set CONSOLE_DEMO_MODE=true to enable demo data.'
            ),
            'metrics': None,
            '_source': 'error',
            '_cached': True,
            'metric_view': resolve_metric_view(),
        }), 503

    try:
        metrics = get_metrics_bundle(filters)
        metrics = _with_kpi_ytd_trends(metrics) or metrics
        if not metrics or not metrics.get('kpis'):
            raise RuntimeError('No metrics returned from SQL')
        meta = metrics.get('meta') or {}
        return jsonify(metrics_bundle_to_console_payload(metrics, {
            'fromCache': meta.get('source') in ('cache',),
            '_sql_warning': meta.get('sql_warning'),
        }))
    except Exception as e:
        cached = get_cached_metrics_bundle(filters)
        if cached and cached.get('kpis'):
            cached = _with_kpi_ytd_trends(cached) or cached
            meta = cached.get('meta') or {}
            meta['sql_warning'] = str(e)[:240]
            return jsonify(metrics_bundle_to_console_payload(cached, {
                'fromCache': True,
                '_sql_warning': meta.get('sql_warning'),
            }))
        return jsonify({
            'error': str(e),
            'metrics': None,
            '_source': 'error',
            '_cached': True,
            'metric_view': resolve_metric_view(),
        }), 503
