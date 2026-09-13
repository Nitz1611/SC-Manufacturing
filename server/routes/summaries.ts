import { Router } from 'express';
import { z } from 'zod';
import {
  getMetricsBundle,
  metricsBundleToConsolePayload,
  warmupWarehouse,
} from '../lib/analytics.js';
import { buildTabInsights } from '../lib/metricsTransform.js';
import { sqlConfigured } from '../lib/databricksSql.js';

const summarySchema = z.object({
  entityType: z.enum(['overview', 'category', 'line', 'dow', 'reason']),
  params: z.record(z.unknown()).default({}),
  forceRefresh: z.boolean().optional(),
});

const clientSummaryCache = new Map<string, { narrative: string; ts: number }>();
const SUMMARY_TTL_MS = Number(process.env.SUMMARY_CACHE_TTL_HOURS || 24) * 3600 * 1000;

export const summariesRouter = Router();

summariesRouter.post('/summaries', async (req, res) => {
  const parsed = summarySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { entityType, params, forceRefresh } = parsed.data;
  const cacheKey = `${entityType}:${JSON.stringify(params)}`;

  if (!forceRefresh) {
    const hit = clientSummaryCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < SUMMARY_TTL_MS) {
      return res.json({ narrative: hit.narrative, cached: true, entityType });
    }
  }

  try {
    const metrics = await getMetricsBundle(params);
    const narrative = metrics.tab_insights[entityType] || buildTabInsights(metrics)[entityType] || '';
    clientSummaryCache.set(cacheKey, { narrative, ts: Date.now() });
    return res.json({ narrative, cached: false, entityType, source: metrics.meta.source });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

summariesRouter.get('/warmup', async (_req, res) => {
  try {
    if (sqlConfigured()) {
      await warmupWarehouse();
      return res.json({ ok: true, message: 'SQL warehouse warmed up' });
    }
    return res.json({ ok: true, message: 'SQL not configured — skipped' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

summariesRouter.post('/console-data', async (req, res) => {
  const filters = (req.body?.filters || {}) as Record<string, unknown>;
  try {
    const metrics = await getMetricsBundle(filters);
    res.json(metricsBundleToConsolePayload(metrics));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
