/**
 * Background jobs for long-running Supervisor calls.
 * Browser polls GET /api/job/:id until status is done|error.
 */

export type JobStatus = 'running' | 'done' | 'error';

export interface JobRecord {
  status: JobStatus;
  result: unknown;
  error: string;
  started: number;
  message?: string;
}

const jobs = new Map<string, JobRecord>();
const JOB_TTL_MS = 2 * 3600 * 1000;

function cleanupOldJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.started < cutoff) jobs.delete(id);
  }
}

export function newJobId(): string {
  cleanupOldJobs();
  return crypto.randomUUID();
}

export function createJob(id: string, message?: string): void {
  jobs.set(id, { status: 'running', result: null, error: '', started: Date.now(), message });
}

export function updateJobMessage(id: string, message: string): void {
  const job = jobs.get(id);
  if (job?.status === 'running') {
    jobs.set(id, { ...job, message });
  }
}

export function finishJob(id: string, result: unknown): void {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, status: 'done', result, error: '' });
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, status: 'error', result: null, error });
}

export function getJob(id: string): JobRecord | undefined {
  return jobs.get(id);
}

export function runningJobCount(): number {
  return [...jobs.values()].filter(j => j.status === 'running').length;
}

export function loadStatus(): { state: string; step: number; elapsed: number } {
  const running = [...jobs.values()].filter(j => j.status === 'running');
  if (!running.length) {
    const done = [...jobs.values()].filter(j => j.status === 'done');
    if (done.length) return { state: 'done', step: 3, elapsed: 0 };
    return { state: 'idle', step: 0, elapsed: 0 };
  }
  const oldest = running.reduce((a, b) => (a.started < b.started ? a : b));
  const elapsed = Math.floor((Date.now() - oldest.started) / 1000);
  let step = 1;
  if (elapsed >= 5) step = 2;
  if (elapsed >= 15) step = 3;
  return { state: 'running', step, elapsed };
}
