import { Router } from 'express';
import { getJob, loadStatus } from '../lib/jobs.js';

export const jobsRouter = Router();

/** VR Dashboard — poll background Supervisor job status. */
jobsRouter.get('/job/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ status: 'error', error: 'Job not found' });
  }

  const elapsed = Math.floor((Date.now() - job.started) / 1000);

  if (job.status === 'running') {
    return res.json({
      status: 'running',
      elapsed,
      message: job.message || `Supervisor querying Genie views… (${elapsed}s elapsed)`,
    });
  }

  if (job.status === 'error') {
    return res.json({ status: 'error', error: job.error, elapsed });
  }

  return res.json({ status: 'done', result: job.result, elapsed });
});

/** VR Dashboard loader steps — connecting / querying / synthesising. */
jobsRouter.get('/load-status', (_req, res) => {
  res.json(loadStatus());
});
