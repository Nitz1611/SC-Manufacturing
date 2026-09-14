import express from 'express';
import cors from 'cors';
import path from 'path';
import { analyticsRouter } from './routes/analytics.js';
import { jobsRouter } from './routes/jobs.js';
import { summariesRouter } from './routes/summaries.js';
import { cacheInfo } from './lib/cache.js';
import { loadEnv, repoRoot, sqlEnvStatus } from './lib/env.js';
import { sqlConfigured } from './lib/databricksSql.js';
import { verifyMetricViewAccess, warmupWarehouse } from './lib/analytics.js';
import { startPreloadScheduler } from './lib/preload.js';
import { resolveSummaryProvider, summaryProviderLabel } from './lib/summaryProvider.js';

loadEnv();
const ROOT = repoRoot();

const app = express();
const PORT = Number(process.env.PORT || process.env.DATABRICKS_APP_PORT || 8000);

app.use(cors());
app.use(express.json());

app.use('/api', analyticsRouter);
app.use('/api', jobsRouter);
app.use('/api', summariesRouter);

app.get('/api/cache/info', (_req, res) => {
  res.json(cacheInfo());
});

const clientDist = path.join(ROOT, 'client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  const index = path.join(clientDist, 'index.html');
  res.sendFile(index, err => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html><html><body style="font-family:Inter,sans-serif;padding:40px">
        <h1>SC Manufacturing Console</h1>
        <p>Server is running on port ${PORT}.</p>
        <p>Run <code>npm run dev</code> from repo root to start the React client.</p>
        <p><a href="/api/status">/api/status</a></p>
        </body></html>`);
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  SC Manufacturing Console                            ║');
  console.log(`║  http://localhost:${PORT}                              ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  const mode = sqlConfigured() ? 'Live SQL (metric view)     ' : 'Demo fallback (no .env SQL)';
  console.log(`║  Mode       : ${mode.padEnd(38)}║`);
  const provider = resolveSummaryProvider();
  const sumMode = provider === 'template'
    ? 'Template summaries (no AI endpoint) '
    : `${summaryProviderLabel(provider)} (AI summaries) `;
  console.log(`║  Summaries  : ${sumMode.padEnd(38)}║`);
  const env = sqlEnvStatus();
  if (env.env_file) {
    console.log(`║  .env       : ${env.env_file.slice(-38).padEnd(38)}║`);
  }
  if (env.missing.length) {
    console.log(`║  Missing    : ${env.missing.join(', ').slice(0, 38).padEnd(38)}║`);
  }
  console.log(`║  Analytics  : POST /api/analytics/query/:queryKey    ║`);
  console.log(`║  Summaries  : POST /api/summaries                    ║`);
  console.log(`║  Legacy     : POST /api/console-data                   ║`);
  console.log(`║  Preload    : GET  /api/preload/status                 ║`);
  console.log(`║  Warmup     : GET  /api/warmup                         ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  if (sqlConfigured()) {
    void (async () => {
      try {
        await warmupWarehouse();
        const test = await verifyMetricViewAccess();
        if (test.ok) {
          console.log(`[startup] ✓ metric view OK (${test.row_count ?? 0} rows)`);
          startPreloadScheduler();
        } else {
          console.error(`[startup] ✗ metric view check failed: ${test.error}`);
        }
      } catch (e) {
        console.error('[startup] warmup failed:', (e as Error).message);
      }
    })();
  }
});
