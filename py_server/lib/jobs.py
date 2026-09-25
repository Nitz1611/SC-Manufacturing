"""Background jobs for long-running Supervisor calls — mirrors server/lib/jobs.ts."""
from __future__ import annotations

import time
import uuid
from typing import Any, Literal, TypedDict

JobStatus = Literal["running", "done", "error"]


class JobRecord(TypedDict, total=False):
    status: JobStatus
    result: Any
    error: str
    started: float
    message: str


_jobs: dict[str, JobRecord] = {}
JOB_TTL_MS = 2 * 3600 * 1000


def _cleanup_old_jobs() -> None:
    cutoff = (time.time() * 1000) - JOB_TTL_MS
    for job_id, job in list(_jobs.items()):
        if job["started"] < cutoff:
            del _jobs[job_id]


def new_job_id() -> str:
    _cleanup_old_jobs()
    return str(uuid.uuid4())


def create_job(job_id: str, message: str | None = None) -> None:
    record: JobRecord = {
        "status": "running",
        "result": None,
        "error": "",
        "started": time.time() * 1000,
    }
    if message is not None:
        record["message"] = message
    _jobs[job_id] = record


def update_job_message(job_id: str, message: str) -> None:
    job = _jobs.get(job_id)
    if job and job.get("status") == "running":
        _jobs[job_id] = {**job, "message": message}


def finish_job(job_id: str, result: Any) -> None:
    job = _jobs.get(job_id)
    if not job:
        return
    _jobs[job_id] = {**job, "status": "done", "result": result, "error": ""}


def fail_job(job_id: str, error: str) -> None:
    job = _jobs.get(job_id)
    if not job:
        return
    _jobs[job_id] = {**job, "status": "error", "result": None, "error": error}


def get_job(job_id: str) -> JobRecord | None:
    return _jobs.get(job_id)


def running_job_count() -> int:
    return sum(1 for job in _jobs.values() if job.get("status") == "running")


def load_status() -> dict[str, int | str]:
    running = [job for job in _jobs.values() if job.get("status") == "running"]
    if not running:
        done = [job for job in _jobs.values() if job.get("status") == "done"]
        if done:
            return {"state": "done", "step": 3, "elapsed": 0}
        return {"state": "idle", "step": 0, "elapsed": 0}
    oldest = min(running, key=lambda j: j["started"])
    elapsed = int((time.time() * 1000 - oldest["started"]) // 1000)
    step = 1
    if elapsed >= 5:
        step = 2
    if elapsed >= 15:
        step = 3
    return {"state": "running", "step": step, "elapsed": elapsed}
