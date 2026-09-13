import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { analyticsRouter } from './routes/analytics.js';
import { summariesRouter } from './routes/summaries.js';
import { cacheInfo } from './lib/cache.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const app = express();
const PORT = Number(process.env.PORT || process.env.DATABRICKS_APP_PORT || 8000);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

app.use(cors());
app.use(express.json());

app.use('/api', analyticsRouter);
app.use('/api', summariesRouter);

app.get('/api/cache/info', (_req, res) => {
  res.json(cacheInfo());
});

const clientDist = path.join(ROOT, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  const index = path.join(clientDist, 'index.html');
  res.sendFile(index, err => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html><html><body style="font-family:Inter,sans-serif;padding:40px">
        <h1>SC Manufacturing Console</h1>
        <p>VR architecture server is running on port ${PORT}.</p>
        <p>Run <code>npm run dev</code> from repo root to start the React client (Vite dev server proxies /api here).</p>
        <p><a href="/api/status">/api/status</a></p>
        </body></html>`);
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  SC Manufacturing Console — VR Architecture          ║');
  console.log(`║  http://localhost:${PORT}                              ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Mode       : ${(process.env.DATABRICKS_WAREHOUSE_ID ? 'SQL + cache fallback' : 'Cache-only (dev)').padEnd(38)}║`);
  console.log(`║  Analytics  : POST /api/analytics/query/:queryKey    ║`);
  console.log(`║  Summaries  : POST /api/summaries                    ║`);
  console.log(`║  Legacy     : POST /api/console-data                   ║`);
  console.log(`║  Warmup     : GET  /api/warmup                         ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});
