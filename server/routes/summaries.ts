import { Router } from 'express';
import { z } from 'zod';
import { getMetricsBundle, metricsBundleToConsolePayload, runAnalyticsQuery } from '../lib/analytics.js';
import { buildTabInsights, applySiteFilter } from '../lib/metricsTransform.js';
import type { MetricsPayload } from '../../shared/types/dashboard.js';

const summarySchema = z.object({
  entityType: z.enum(['overview', 'category', 'line', 'dow', 'reason']),
  params: z.record(z.unknown()).default({}),
  forceRefresh: z.boolean().optional(),
});

const clientSummaryCache = new Map<string, { narrative: string; ts: number }>();
const SUMMARY_TTL_MS = Number(process.env.SUMMARY_CACHE_TTL_HOURS || 24) * 3600 * 1000;

export const summariesRouter = Router();

summariesRouter.post('/summaries', (req, res) => {
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

  const metrics = getMetricsBundle(params);
  const narrative = metrics.tab_insights[entityType] || buildTabInsights(metrics)[entityType] || '';
  clientSummaryCache.set(cacheKey, { narrative, ts: Date.now() });
  return res.json({ narrative, cached: false, entityType });
});

summariesRouter.get('/warmup', async (_req, res) => {
  // VR pattern: fire-and-forget warehouse wake — no-op in cache mode
  res.json({ ok: true, message: 'Warmup acknowledged' });
});

/** Legacy bridge — aggregates analytics into console-data shape for existing UI */
summariesRouter.post('/console-data', (req, res) => {
  const filters = (req.body?.filters || {}) as Record<string, unknown>;
  const metrics = getMetricsBundle(filters);
  res.json(metricsBundleToConsolePayload(metrics));
});

export { getMetricsBundle, applySiteFilter };
export type { MetricsPayload };
