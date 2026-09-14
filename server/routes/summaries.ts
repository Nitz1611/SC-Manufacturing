import { Router } from 'express';
import { z } from 'zod';
import {
  getCachedMetricsBundle,
  getFreshMetricsBundle,
  getMetricsBundle,
  metricsBundleToConsolePayload,
  refreshMetricsBundle,
  resolveMetricView,
  warmupWarehouse,
} from '../lib/analytics.js';
import { coarseCacheKey, consoleDemoMode, normalizeParams } from '../lib/config.js';
import { buildTabInsights } from '../lib/metricsTransform.js';
import { sqlConfigured } from '../lib/databricksSql.js';
import {
  createJob,
  failJob,
  finishJob,
  newJobId,
  updateJobMessage,
} from '../lib/jobs.js';
import { getPreloadStatus, preloadEnabled } from '../lib/preload.js';
import { getAllSupervisorSummaries, getSupervisorSummary, supervisorConfigured } from '../lib/supervisor.js';
import type { SummaryEntity } from '../lib/summaryPrompts.js';

const SUMMARY_TABS: SummaryEntity[] = ['overview', 'category', 'line', 'dow', 'reason'];

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

function cachedBatchSummaries(params: Record<string, unknown>): Record<string, string> | null {
  const summaries = Object.fromEntries(
    SUMMARY_TABS.map(tab => {
      const hit = summaryCache.get(summaryCacheKey(tab, params));
      return [tab, hit?.narrative || ''];
    }),
  );
  const allPresent = SUMMARY_TABS.every(tab => summaries[tab]);
  return allPresent ? summaries : null;
}

function storeBatchSummaries(
  params: Record<string, unknown>,
  summaries: Record<string, string>,
  source: string,
): void {
  for (const [tab, narrative] of Object.entries(summaries)) {
    if (narrative) {
      summaryCache.set(summaryCacheKey(tab, params), { narrative, source, ts: Date.now() });
    }
  }
}

export const summariesRouter = Router();

/** Supervisor Agent → Genie for tab narrative. */
summariesRouter.post('/summaries', async (req, res) => {
  const parsed = summarySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { entityType, params, forceRefresh } = parsed.data;
  const cacheKey = summaryCacheKey(entityType, params);

  if (!forceRefresh && !supervisorConfigured()) {
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
      const filters = filtersFromParams(params);
      const metrics = getCachedMetricsBundle(params);
      const { narrative, source } = await getSupervisorSummary(entityType, filters, metrics);
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

/**
 * Background Supervisor job + browser polling for AI summaries.
 * Returns cached summaries immediately, or `_job_id` for async Genie queries.
 */
summariesRouter.post('/summaries/batch', async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { params, forceRefresh } = parsed.data;
  const filters = filtersFromParams(params);

  if (!forceRefresh && !supervisorConfigured()) {
    const cached = cachedBatchSummaries(params);
    if (cached) {
      const firstHit = summaryCache.get(summaryCacheKey(SUMMARY_TABS[0], params))!;
      return res.json({
        summaries: cached,
        cached: true,
        source: firstHit.source,
        _job_id: null,
      });
    }
  }

  if (!supervisorConfigured()) {
    try {
      const metrics = await getMetricsBundle(params);
      const templateInsights = metrics.tab_insights || buildTabInsights(metrics);
      return res.json({ summaries: templateInsights, cached: false, source: 'template', _job_id: null });
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  const jobId = newJobId();
  createJob(jobId);

  void (async () => {
    try {
      console.log(`[job ${jobId.slice(0, 8)}] Starting Supervisor batch…`);
      const metrics = getCachedMetricsBundle(params);
      const summaries = await getAllSupervisorSummaries(filters, metrics);
      storeBatchSummaries(params, summaries, 'supervisor');
      finishJob(jobId, { summaries, source: 'supervisor' });
      console.log(`[job ${jobId.slice(0, 8)}] Done — ${Object.values(summaries).filter(Boolean).length} tabs`);
    } catch (e) {
      try {
        const metrics = getCachedMetricsBundle(params) || await getMetricsBundle(params);
        const templateInsights = metrics.tab_insights || buildTabInsights(metrics);
        storeBatchSummaries(params, templateInsights, 'template-fallback');
        finishJob(jobId, { summaries: templateInsights, source: 'template-fallback' });
        console.warn(`[job ${jobId.slice(0, 8)}] Supervisor failed — using template fallback:`, (e as Error).message);
      } catch (inner) {
        failJob(jobId, (e as Error).message);
        console.error(`[job ${jobId.slice(0, 8)}] Failed:`, (e as Error).message);
      }
    }
  })();

  return res.json({
    _job_id: jobId,
    _cached: false,
    status: 'running',
    source: 'supervisor',
  });
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

summariesRouter.get('/preload/status', (_req, res) => {
  res.json(getPreloadStatus());
});

summariesRouter.post('/console-data', async (req, res) => {
  const filters = (req.body?.filters || {}) as Record<string, unknown>;
  const force = Boolean(req.body?.force);
  const usePreload = preloadEnabled() && sqlConfigured();

  const cached = getCachedMetricsBundle(filters);
  const fresh = getFreshMetricsBundle(filters);

  if (cached && (usePreload || !force)) {
    return res.json(metricsBundleToConsolePayload(cached, {
      fromCache: true,
      _refreshing: usePreload && !fresh,
    }));
  }

  if (sqlConfigured()) {
    const jobId = newJobId();
    createJob(jobId, 'Connecting to Databricks metric view…');

    void (async () => {
      try {
        const metrics = await refreshMetricsBundle(filters, msg => updateJobMessage(jobId, msg));
        finishJob(jobId, { metrics, filterKey: coarseCacheKey(normalizeParams(filters)) });
        console.log(`[job ${jobId.slice(0, 8)}] Metrics refresh complete`);
      } catch (e) {
        failJob(jobId, (e as Error).message);
        console.error(`[job ${jobId.slice(0, 8)}] Metrics refresh failed:`, (e as Error).message);
      }
    })();

    const stale = force ? null : cached;
    if (stale) {
      const payload = metricsBundleToConsolePayload(stale, { _job_id: jobId, _refreshing: true, fromCache: true });
      return res.json(payload);
    }

    return res.json({
      metrics: null,
      dashboard: {},
      _cached: true,
      _refreshing: true,
      _job_id: jobId,
      _source: 'loading',
      status: 'running',
    });
  }

  if (!consoleDemoMode()) {
    return res.status(503).json({
      error: 'Live SQL is not configured. Set DATABRICKS_* in .env, or set CONSOLE_DEMO_MODE=true to enable demo data.',
      metrics: null,
      _source: 'error',
      _cached: true,
      metric_view: resolveMetricView(),
    });
  }

  try {
    const metrics = await getMetricsBundle(filters);
    return res.json(metricsBundleToConsolePayload(metrics));
  } catch (e) {
    const message = (e as Error).message;
    return res.status(503).json({
      error: message,
      metrics: null,
      _source: 'error',
      _cached: true,
      metric_view: resolveMetricView(),
    });
  }
});
