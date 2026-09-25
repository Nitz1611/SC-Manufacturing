"""Flask blueprint registration — mirrors server/server.ts route mounting."""
from __future__ import annotations

from flask import Blueprint, Flask, jsonify

from py_server.lib.cache import cache_info

from .analytics import bp as analytics_bp
from .jobs import bp as jobs_bp
from .maintenance import bp as maintenance_bp
from .summaries import bp as summaries_bp

cache_bp = Blueprint('cache', __name__)


@cache_bp.get('/cache/info')
def cache_info_route():
    return jsonify(cache_info())


BLUEPRINTS: list[Blueprint] = [
    analytics_bp,
    jobs_bp,
    maintenance_bp,
    summaries_bp,
    cache_bp,
]

# Route list mapped to Flask endpoints (/api prefix added in app.py).
ROUTE_MAP: list[dict[str, str]] = [
    {'method': 'POST', 'path': '/analytics/query/<query_key>', 'endpoint': 'analytics.run_query'},
    {'method': 'GET', 'path': '/warmup', 'endpoint': 'analytics.warmup'},
    {'method': 'GET', 'path': '/status', 'endpoint': 'analytics.status'},
    {'method': 'GET', 'path': '/job/<job_id>', 'endpoint': 'jobs.job_status'},
    {'method': 'GET', 'path': '/load-status', 'endpoint': 'jobs.load_status_route'},
    {'method': 'GET', 'path': '/summaries/status', 'endpoint': 'summaries.summaries_status'},
    {'method': 'POST', 'path': '/summaries', 'endpoint': 'summaries.single_summary'},
    {'method': 'POST', 'path': '/summaries/batch', 'endpoint': 'summaries.batch_summaries'},
    {'method': 'GET', 'path': '/preload/status', 'endpoint': 'summaries.preload_status'},
    {'method': 'POST', 'path': '/console-data', 'endpoint': 'summaries.console_data'},
    {'method': 'POST', 'path': '/maintenance/data', 'endpoint': 'maintenance.maintenance_data'},
    {'method': 'POST', 'path': '/maintenance/insights', 'endpoint': 'maintenance.maintenance_insights'},
    {'method': 'GET', 'path': '/cache/info', 'endpoint': 'cache.cache_info_route'},
]


def register_routes(app: Flask, url_prefix: str = '/api') -> None:
    """Register all API blueprints on the Flask app."""
    for blueprint in BLUEPRINTS:
        app.register_blueprint(blueprint, url_prefix=url_prefix)


def get_route_map(url_prefix: str = '/api') -> list[dict[str, str]]:
    """Return route list with full paths including the API prefix."""
    prefix = url_prefix.rstrip('/')
    return [
        {**route, 'path': f'{prefix}{route["path"]}'}
        for route in ROUTE_MAP
    ]
