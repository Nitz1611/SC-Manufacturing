"""Analytics routes — mirrors server/routes/analytics.ts."""
from __future__ import annotations

import os
import time

from flask import Blueprint, jsonify, request

from py_server.lib.analytics import (
    databricks_configured,
    get_last_sql_error,
    get_last_sql_success_at,
    live_data_required,
    run_analytics_query,
    verify_metric_view_access,
)
from py_server.lib.config import console_demo_mode, resolve_metric_view, sql_column_summary
from py_server.lib.databricks_sql import sql_configured, warmup_warehouse
from py_server.lib.env import sql_env_status
from py_server.lib.jobs import running_job_count
from py_server.lib.preload import get_preload_status
from py_server.lib.summary_provider import describe_summary_provider
from py_server.lib.supervisor import supervisor_configured

VALID_KEYS = [
    'dashboard_dt_kpis',
    'dashboard_dt_period_trend',
    'dashboard_dt_site_by_period',
    'dashboard_dt_category_by_period',
    'dashboard_dt_category_network',
    'dashboard_dt_line_by_period',
    'dashboard_dt_line_network',
    'dashboard_dt_reasons',
    'dashboard_dt_dow',
    'dashboard_dt_top_lines',
    'dashboard_dt_shift_comparison',
    'dashboard_dt_dow_by_shift',
    'dashboard_filter_options',
]

bp = Blueprint('analytics', __name__)


@bp.post('/analytics/query/<query_key>')
def run_query(query_key: str):
    if query_key not in VALID_KEYS:
        return jsonify({'error': f'Unknown query: {query_key}'}), 404

    body = request.get_json(silent=True) or {}
    params = body.get('params') or body or {}
    started = time.time() * 1000

    try:
        result = run_analytics_query(query_key, params)
        rows = result.get('rows', [])
        return jsonify({
            'query_key': query_key,
            'rows': rows,
            'row_count': len(rows),
            'source': result.get('source'),
            '_cached': result.get('cached'),
            'elapsed_ms': int(time.time() * 1000 - started),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.get('/warmup')
def warmup():
    try:
        if sql_configured():
            warmup_warehouse()
            return jsonify({'ok': True, 'message': 'SQL warehouse warmed up'})
        return jsonify({'ok': True, 'message': 'SQL not configured'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.get('/status')
def status():
    configured = databricks_configured()
    env = sql_env_status()
    metric_view = resolve_metric_view()
    sql_test = verify_metric_view_access() if configured else {'ok': False, 'error': 'SQL not configured'}

    if sql_test.get('ok'):
        mode = 'live-sql-metric-view'
    elif configured:
        mode = 'sql-error'
    elif console_demo_mode():
        mode = 'demo-fallback'
    else:
        mode = 'production-no-demo'

    return jsonify({
        'ok': True,
        'architecture': 'sc-manufacturing',
        'sql_configured': configured,
        'sql_ok': sql_test.get('ok'),
        'sql_test': sql_test,
        'last_sql_error': get_last_sql_error(),
        'last_sql_success_at': get_last_sql_success_at(),
        'repo_root': env.get('repo_root'),
        'cwd': env.get('cwd'),
        'env_file': env.get('env_file'),
        'env_search': env.get('env_search'),
        'env_vars_set': {
            'host': env.get('host_set'),
            'token': env.get('token_set'),
            'warehouse': env.get('warehouse_set'),
        },
        'missing_env': env.get('missing'),
        'warehouse': os.getenv('DATABRICKS_WAREHOUSE_ID') or 'NOT SET',
        'host': os.getenv('DATABRICKS_HOST') or os.getenv('DATABRICKS_SERVER_HOSTNAME') or 'NOT SET',
        'catalog': os.getenv('DATABRICKS_CATALOG') or 'main',
        'schema': os.getenv('DATABRICKS_SCHEMA') or '(not set — two-part view name)',
        'metric_view': metric_view,
        'sql_columns': sql_column_summary(),
        'mode': mode,
        'demo_mode': console_demo_mode(),
        'live_data_required': live_data_required(),
        'demo_allowed': console_demo_mode() and not live_data_required(),
        **describe_summary_provider(),
        'supervisor': os.getenv('SUPERVISOR_ENDPOINT_NAME') if supervisor_configured() else 'not configured',
        'active_supervisor_jobs': running_job_count(),
        'preload': get_preload_status(),
    })
