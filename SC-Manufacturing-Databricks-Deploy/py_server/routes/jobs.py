"""Job polling routes — mirrors server/routes/jobs.ts."""
from __future__ import annotations

import time

from flask import Blueprint, jsonify

from py_server.lib.jobs import get_job, load_status

bp = Blueprint('jobs', __name__)


@bp.get('/job/<job_id>')
def job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        return jsonify({'status': 'error', 'error': 'Job not found'}), 404

    elapsed = int((time.time() * 1000 - job['started']) // 1000)

    if job.get('status') == 'running':
        return jsonify({
            'status': 'running',
            'elapsed': elapsed,
            'message': job.get('message') or f'Background task running… ({elapsed}s elapsed)',
        })

    if job.get('status') == 'error':
        return jsonify({'status': 'error', 'error': job.get('error'), 'elapsed': elapsed})

    return jsonify({'status': 'done', 'result': job.get('result'), 'elapsed': elapsed})


@bp.get('/load-status')
def load_status_route():
    return jsonify(load_status())
