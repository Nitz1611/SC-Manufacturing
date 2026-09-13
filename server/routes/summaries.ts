import { Router } from 'express';
import { z } from 'zod';
import {
  getMetricsBundle,
  metricsBundleToConsolePayload,
  resolveMetricView,
  warmupWarehouse,
} from '../lib/analytics.js';
import { buildTabInsights } from '../lib/metricsTransform.js';
import { sqlConfigured } from '../lib/databricksSql.js';
import { getAllSupervisorSummaries, getSupervisorSummary, supervisorConfigured } from '../lib/supervisor.js';
import type { SummaryEntity } from '../lib/summaryPrompts.js';

const summarySchema = z.object({
  entityType: z.enum(['overview', 'category', 'line', 'dow', 'reason']),
  params: z.record(z.unknown()).default({}),
  forceRefresh: z.boolean().optional(),
});

const batchSchema = z.object({
  params: z.record(z.unknown()).default({}),
  forceRefresh: z.boolean().optional(),
});

const summaryCache = new Map<string, { narrative: string; source: string; ts: number }>();
const SUMMARY_TTL_MS = Number(process.env.SUMMARY_CACHE_TTL_HOURS || 24) * 3600 * 1000;

function summaryCacheKey(entityType: string, params: Record<string, unknown>): string {
  return `${entityType}:${JSON.stringify(params)}`;
}

function filtersFromParams(params: Record<string, unknown>): Record<string, unknown> {
  return {
    showIn: params.showIn,
    timeframe: params.timeframe || params.timeframe_mode || 'FY',
    year: params.year,
    site: params.site,
    region: params.region,
    market: params.market,
    period: params.period,
  };
}

async function fallbackNarrative(
  entityType: SummaryEntity,
  params: Record<string, unknown>,
): Promise<string> {
  const metrics = await getMetricsBundle(params);
  const insights = metrics.tab_insights?.[entityType] || buildTabInsights(metrics)[entityType] || '';
  return insights;
}

export const summariesRouter = Router();

summariesRouter.post('/summaries', async (req, res) => {
  const parsed = summarySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { entityType, params, forceRefresh } = parsed.data;
  const cacheKey = summaryCacheKey(entityType, params);

  if (!forceRefresh) {
    const hit = summaryCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < SUMMARY_TTL_MS) {
      return res.json({
        narrative: hit.narrative,
        cached: true,
        entityType,
        source: hit.source,
      });
    }
  }

  try {
    if (supervisorConfigured()) {
      const { narrative, source } = await getSupervisorSummary(entityType, filtersFromParams(params));
      summaryCache.set(cacheKey, { narrative, source, ts: Date.now() });
      return res.json({ narrative, cached: false, entityType, source });
    }

    const narrative = await fallbackNarrative(entityType, params);
    summaryCache.set(cacheKey, { narrative, source: 'template', ts: Date.now() });
    return res.json({ narrative, cached: false, entityType, source: 'template' });
  } catch (e) {
    try {
      const narrative = await fallbackNarrative(entityType, params);
      return res.json({
        narrative,
        cached: false,
        entityType,
        source: 'template-fallback',
        warning: (e as Error).message,
      });
    } catch (inner) {
      return res.status(500).json({ error: (inner as Error).message });
    }
  }
});

/** Batch load all KPI tab summaries for current filters (parallel Supervisor calls). */
summariesRouter.post('/summaries/batch', async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { params, forceRefresh } = parsed.data;
  const filters = filtersFromParams(params);

  if (!forceRefresh) {
    const tabs: SummaryEntity[] = ['overview', 'category', 'line', 'dow', 'reason'];
    const allCached = tabs.every(tab => {
      const hit = summaryCache.get(summaryCacheKey(tab, params));
      return hit && Date.now() - hit.ts < SUMMARY_TTL_MS;
    });
    if (allCached) {
      const summaries = Object.fromEntries(
        tabs.map(tab => [tab, summaryCache.get(summaryCacheKey(tab, params))!.narrative]),
      );
      return res.json({ summaries, cached: true, source: 'supervisor' });
    }
  }

  try {
    if (supervisorConfigured()) {
      const summaries = await getAllSupervisorSummaries(filters);
      const source = 'supervisor';
      for (const [tab, narrative] of Object.entries(summaries)) {
        if (narrative) {
          summaryCache.set(summaryCacheKey(tab, params), { narrative, source, ts: Date.now() });
        }
      }
      return res.json({ summaries, cached: false, source });
    }

    const metrics = await getMetricsBundle(params);
    const insights = metrics.tab_insights || buildTabInsights(metrics);
    return res.json({ summaries: insights, cached: false, source: 'template' });
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
    const payload = metricsBundleToConsolePayload(metrics);
    res.json(payload);
  } catch (e) {
    const message = (e as Error).message;
    res.status(503).json({
      error: message,
      metrics: null,
      _source: 'error',
      _cached: true,
      metric_view: resolveMetricView(),
    });
  }
});
