/**
 * Background jobs for long-running Supervisor calls.
 * Browser polls GET /api/job/:id until status is done|error.
 */
const jobs = new Map();
const JOB_TTL_MS = 2 * 3600 * 1000;
function cleanupOldJobs() {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of jobs) {
        if (job.started < cutoff)
            jobs.delete(id);
    }
}
export function newJobId() {
    cleanupOldJobs();
    return crypto.randomUUID();
}
export function createJob(id, message) {
    jobs.set(id, { status: 'running', result: null, error: '', started: Date.now(), message });
}
export function updateJobMessage(id, message) {
    const job = jobs.get(id);
    if (job?.status === 'running') {
        jobs.set(id, { ...job, message });
    }
}
export function finishJob(id, result) {
    const job = jobs.get(id);
    if (!job)
        return;
    jobs.set(id, { ...job, status: 'done', result, error: '' });
}
export function failJob(id, error) {
    const job = jobs.get(id);
    if (!job)
        return;
    jobs.set(id, { ...job, status: 'error', result: null, error });
}
export function getJob(id) {
    return jobs.get(id);
}
export function runningJobCount() {
    return [...jobs.values()].filter(j => j.status === 'running').length;
}
export function loadStatus() {
    const running = [...jobs.values()].filter(j => j.status === 'running');
    if (!running.length) {
        const done = [...jobs.values()].filter(j => j.status === 'done');
        if (done.length)
            return { state: 'done', step: 3, elapsed: 0 };
        return { state: 'idle', step: 0, elapsed: 0 };
    }
    const oldest = running.reduce((a, b) => (a.started < b.started ? a : b));
    const elapsed = Math.floor((Date.now() - oldest.started) / 1000);
    let step = 1;
    if (elapsed >= 5)
        step = 2;
    if (elapsed >= 15)
        step = 3;
    return { state: 'running', step, elapsed };
}
