"""Maintenance console routes."""
from __future__ import annotations

import json
import os
import time
from typing import Any

from flask import Blueprint, jsonify, request

from py_server.lib.analytics import (
    get_cached_metrics_bundle,
    get_fresh_metrics_bundle,
    get_metrics_bundle,
    schedule_extended_metrics_load,
    schedule_metrics_refresh,
)
from py_server.lib.claude_summary import claude_configured, invoke_claude
from py_server.lib.config import normalize_params
from py_server.lib.maintenance import build_maintenance_payload, build_maintenance_payload_from_filters
from py_server.lib.metrics_transform import build_tab_insights
from py_server.lib.summary_provider import resolve_summary_provider

bp = Blueprint('maintenance', __name__)

_insights_cache: dict[str, dict[str, Any]] = {}
_payload_cache: dict[str, dict[str, Any]] = {}
INSIGHTS_TTL_MS = int(os.getenv('MAINTENANCE_INSIGHTS_TTL_HOURS') or 6) * 3600 * 1000
PAYLOAD_TTL_MS = int(os.getenv('MAINTENANCE_PAYLOAD_TTL_MINUTES') or 15) * 60 * 1000


def _filters_from_body(body: dict[str, Any]) -> dict[str, Any]:
    return body.get('filters') or body.get('params') or {}


def _metrics_for_request(filters: dict[str, Any]) -> dict[str, Any]:
    return get_metrics_bundle(filters)


def _insights_cache_key(filters: dict[str, Any]) -> str:
    scoped = dict(filters or {})
    scoped["timeframe"] = "ptd"
    norm = normalize_params(scoped)
    return json.dumps(norm, sort_keys=True)


def _claude_maintenance_insights(
    filters: dict[str, Any],
    metrics: dict[str, Any],
) -> list[dict[str, Any]]:
    from datetime import datetime, timezone

    tab = build_tab_insights(metrics)
    kpis = metrics.get('kpis') or {}
    compact = {
        'kpis': kpis,
        'period_trend': metrics.get('period_trend'),
        'periods': metrics.get('periods'),
        'reasons': (metrics.get('reasons') or [])[:5],
        'top_lines': dict(list((metrics.get('top_lines') or {}).items())[:5]),
        'sites_at_risk': (metrics.get('site_kpis') or {}),
        'shift_comparison': metrics.get('shift_comparison'),
        'tab_insights': tab,
    }

    user = f"""You are a senior maintenance operations analyst writing for plant leadership.
Using ONLY the metrics JSON below, write exactly 4 insight cards focused on business impact.
Each card must quantify operational and financial exposure (hours lost, capacity risk, fill-rate impact).
Do NOT use category labels like WHEN, WHY, HOW, or OVERVIEW.

Each card fields:
- severity: critical|high|medium|info
- title: concise executive headline (max 12 words)
- body: 3-4 polished sentences with exact numbers from the data and one actionable recommendation

Metrics:
{json.dumps(compact, indent=2)}

Return ONLY valid JSON array:
[
  {{"severity":"...","title":"...","body":"..."}},
  {{"severity":"...","title":"...","body":"..."}},
  {{"severity":"...","title":"...","body":"..."}},
  {{"severity":"...","title":"...","body":"..."}}
]"""

    raw = invoke_claude([{'role': 'user', 'content': user}])
    text = raw.strip()
    if text.startswith('```'):
        text = text.split('```')[1]
        if text.startswith('json'):
            text = text[4:]
    parsed = json.loads(text.strip())
    if not isinstance(parsed, list):
        raise ValueError('Claude maintenance insights must return a JSON array')

    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    out: list[dict[str, Any]] = []
    for i, card in enumerate(parsed):
        if not isinstance(card, dict):
            continue
        out.append({
            'id': str(card.get('id') or f'insight-{i}').lower(),
            'severity': str(card.get('severity') or 'info').lower(),
            'title': str(card.get('title') or 'Maintenance insight'),
            'timestamp': now,
            'body': str(card.get('body') or '').strip(),
        })
    if len(out) < 4:
        raise ValueError('Claude returned fewer than 4 insight cards')
    return out


@bp.post('/maintenance/data')
def maintenance_data():
    body = request.get_json(silent=True) or {}
    filters = _filters_from_body(body)
    force_refresh = bool(body.get('forceRefresh') or body.get('refresh'))

    def _respond(metrics: dict[str, Any], *, source: str, cached: bool) -> Any:
        payload = build_maintenance_payload_from_filters(metrics, filters)
        meta = metrics.get('meta') or {}
        partial = bool(meta.get('partial'))
        if partial:
            schedule_extended_metrics_load(filters)
        elif cached and not get_fresh_metrics_bundle(filters):
            schedule_metrics_refresh(filters)
        return jsonify({
            **payload,
            '_source': meta.get('source', source),
            '_live': meta.get('source') in ('sql', 'cache'),
            '_cached': cached,
            '_sql_warning': meta.get('sql_warning'),
            '_partial': partial,
            '_refreshing': partial,
        })

    try:
        if not force_refresh:
            cached = get_cached_metrics_bundle(filters)
            if cached and cached.get('kpis'):
                return _respond(cached, source='cache', cached=True)

        metrics = get_metrics_bundle(filters)
        meta = metrics.get('meta') or {}
        return _respond(
            metrics,
            source=str(meta.get('source') or 'live'),
            cached=meta.get('source') in ('cache',),
        )
    except Exception as e:
        cached = get_cached_metrics_bundle(filters)
        if cached and cached.get('kpis'):
            try:
                return _respond(cached, source='cache', cached=True)
            except Exception as inner:
                return jsonify({'error': str(inner)[:500]}), 500
        return jsonify({'error': str(e)[:500]}), 500


@bp.post('/maintenance/insights')
def maintenance_insights():
    body = request.get_json(silent=True) or {}
    filters = _filters_from_body(body)
    force_refresh = bool(body.get('forceRefresh') or body.get('refresh'))
    cache_key = _insights_cache_key(filters)
    provider = resolve_summary_provider()

    if not force_refresh:
        hit = _insights_cache.get(cache_key)
        if hit and time.time() * 1000 - hit['ts'] < INSIGHTS_TTL_MS:
            return jsonify({
                'ai_summaries': hit['ai_summaries'],
                'cached': True,
                'source': hit['source'],
                'provider': provider,
            })

    try:
        ptd_filters = dict(filters or {})
        ptd_filters["timeframe"] = "ptd"
        metrics = get_metrics_bundle(ptd_filters)
        source = "template"
        payload = build_maintenance_payload_from_filters(metrics, filters)
        ai_summaries = payload["ai_summaries"]

        if provider == "claude" and claude_configured():
            try:
                ai_summaries = _claude_maintenance_insights(ptd_filters, metrics)
                source = "claude"
            except Exception as claude_err:
                if not body.get("allowFallback", True):
                    return jsonify({"error": str(claude_err), "provider": provider}), 502
                source = "template-fallback"
                ai_summaries = payload["ai_summaries"]
                _insights_cache[cache_key] = {
                    'ai_summaries': ai_summaries,
                    'source': source,
                    'ts': time.time() * 1000,
                    'warning': str(claude_err),
                }
                return jsonify({
                    'ai_summaries': ai_summaries,
                    'cached': False,
                    'source': source,
                    'provider': provider,
                    'warning': str(claude_err),
                })

        _insights_cache[cache_key] = {
            'ai_summaries': ai_summaries,
            'source': source,
            'ts': time.time() * 1000,
        }
        return jsonify({
            'ai_summaries': ai_summaries,
            'cached': False,
            'source': source,
            'provider': provider,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
