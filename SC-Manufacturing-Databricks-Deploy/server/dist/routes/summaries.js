import { Router } from 'express';
import { z } from 'zod';
import { getCachedMetricsBundle, getFreshMetricsBundle, getMetricsBundle, metricsBundleToConsolePayload, refreshMetricsBundle, resolveMetricView, warmupWarehouse, } from '../lib/analytics.js';
import { claudeStatus, getClaudeBatchSummaries, getClaudeTabSummary } from '../lib/claudeSummary.js';
import { coarseCacheKey, consoleDemoMode, normalizeParams } from '../lib/config.js';
import { buildTabInsights } from '../lib/metricsTransform.js';
import { sqlConfigured } from '../lib/databricksSql.js';
import { createJob, failJob, finishJob, newJobId, updateJobMessage, } from '../lib/jobs.js';
import { getPreloadStatus, preloadEnabled } from '../lib/preload.js';
import { resolveSummaryProvider, summaryProviderLabel, isFallbackSummarySource, allowTemplateFallback, describeSummaryProvider } from '../lib/summaryProvider.js';
import { testDatabricksReachability } from '../lib/databricksFetch.js';
import { getAllSupervisorSummaries, getSupervisorSummary } from '../lib/supervisor.js';
const SUMMARY_TABS = ['overview', 'category', 'line', 'dow', 'reason'];
const summarySchema = z.object({
    entityType: z.enum(['overview', 'category', 'line', 'dow', 'reason']),
    params: z.record(z.unknown()).default({}),
    forceRefresh: z.boolean().optional(),
});
const batchSchema = z.object({
    params: z.record(z.unknown()).default({}),
    forceRefresh: z.boolean().optional(),
});
const summaryCache = new Map();
const SUMMARY_TTL_MS = Number(process.env.SUMMARY_CACHE_TTL_HOURS || 24) * 3600 * 1000;
function summaryCacheKey(entityType, params) {
    return `${entityType}:${JSON.stringify(params)}`;
}
function filtersFromParams(params) {
    return {
        showIn: params.showIn,
        timeframe: params.timeframe || params.timeframe_mode || 'FY',
        year: params.year,
        site: params.site,
        region: params.region,
        period: params.period,
    };
}
async function fallbackNarrative(entityType, params) {
    const metrics = await getMetricsBundle(params);
    const insights = metrics.tab_insights?.[entityType] || buildTabInsights(metrics)[entityType] || '';
    return insights;
}
async function metricsForSummaries(params) {
    return getCachedMetricsBundle(params) || await getMetricsBundle(params);
}
function cachedBatchSummaries(params, provider) {
    const summaries = Object.fromEntries(SUMMARY_TABS.map(tab => {
        const hit = summaryCache.get(summaryCacheKey(tab, params));
        return [tab, hit?.narrative || ''];
    }));
    const allPresent = SUMMARY_TABS.every(tab => summaries[tab]);
    if (!allPresent)
        return null;
    const firstHit = summaryCache.get(summaryCacheKey(SUMMARY_TABS[0], params));
    if (firstHit && isFallbackSummarySource(firstHit.source) && provider !== 'template') {
        for (const tab of SUMMARY_TABS)
            summaryCache.delete(summaryCacheKey(tab, params));
        return null;
    }
    return summaries;
}
function storeBatchSummaries(params, summaries, source) {
    if (isFallbackSummarySource(source))
        return;
    for (const [tab, narrative] of Object.entries(summaries)) {
        if (narrative) {
            summaryCache.set(summaryCacheKey(tab, params), { narrative, source, ts: Date.now() });
        }
    }
}
async function generateBatchSummaries(provider, filters, params) {
    const metrics = await metricsForSummaries(params);
    if (provider === 'claude') {
        return getClaudeBatchSummaries(filters, metrics);
    }
    if (provider === 'supervisor') {
        return getAllSupervisorSummaries(filters, metrics);
    }
    return metrics.tab_insights || buildTabInsights(metrics);
}
export const summariesRouter = Router();
summariesRouter.get('/summaries/status', async (_req, res) => {
    const connectivity = await testDatabricksReachability();
    res.json({
        ok: true,
        ...describeSummaryProvider(),
        claude: claudeStatus(),
        connectivity,
    });
});
/** Tab narrative — Claude Opus by default, or Supervisor when configured. */
summariesRouter.post('/summaries', async (req, res) => {
    const parsed = summarySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
    }
    const { entityType, params, forceRefresh } = parsed.data;
    const cacheKey = summaryCacheKey(entityType, params);
    const provider = resolveSummaryProvider();
    if (!forceRefresh) {
        const hit = summaryCache.get(cacheKey);
        if (hit && Date.now() - hit.ts < SUMMARY_TTL_MS) {
            if (!(isFallbackSummarySource(hit.source) && provider !== 'template')) {
                return res.json({
                    narrative: hit.narrative,
                    cached: true,
                    entityType,
                    source: hit.source,
                    provider,
                });
            }
        }
    }
    try {
        const filters = filtersFromParams(params);
        const metrics = await metricsForSummaries(params);
        let narrative;
        let source;
        if (provider === 'claude') {
            ({ narrative, source } = await getClaudeTabSummary(entityType, filters, metrics));
        }
        else if (provider === 'supervisor') {
            ({ narrative, source } = await getSupervisorSummary(entityType, filters, metrics));
        }
        else {
            narrative = await fallbackNarrative(entityType, params);
            source = 'template';
        }
        if (!isFallbackSummarySource(source)) {
            summaryCache.set(cacheKey, { narrative, source, ts: Date.now() });
        }
        return res.json({ narrative, cached: false, entityType, source, provider });
    }
    catch (e) {
        if ((provider === 'claude' || provider === 'supervisor') && !allowTemplateFallback()) {
            return res.status(502).json({
                error: e.message,
                entityType,
                provider,
                source: 'error',
            });
        }
        try {
            const narrative = await fallbackNarrative(entityType, params);
            return res.json({
                narrative,
                cached: false,
                entityType,
                source: 'template-fallback',
                provider,
                warning: e.message,
            });
        }
        catch (inner) {
            return res.status(500).json({ error: inner.message });
        }
    }
});
/** Background job + browser polling for batch AI summaries. */
summariesRouter.post('/summaries/batch', async (req, res) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
    }
    const { params, forceRefresh } = parsed.data;
    const filters = filtersFromParams(params);
    const provider = resolveSummaryProvider();
    if (!forceRefresh) {
        const cached = cachedBatchSummaries(params, provider);
        if (cached) {
            const firstHit = summaryCache.get(summaryCacheKey(SUMMARY_TABS[0], params));
            return res.json({
                summaries: cached,
                cached: true,
                source: firstHit.source,
                provider,
                _job_id: null,
            });
        }
    }
    if (provider === 'template') {
        try {
            const metrics = await getMetricsBundle(params);
            const templateInsights = metrics.tab_insights || buildTabInsights(metrics);
            return res.json({
                summaries: templateInsights,
                cached: false,
                source: 'template',
                provider,
                warning: describeSummaryProvider().reason,
                _job_id: null,
            });
        }
        catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }
    const jobId = newJobId();
    createJob(jobId, provider === 'claude' ? 'Generating AI summaries…' : 'Connecting to Supervisor…');
    void (async () => {
        try {
            console.log(`[job ${jobId.slice(0, 8)}] Starting ${provider} batch…`);
            const summaries = await generateBatchSummaries(provider, filters, params);
            const source = summaryProviderLabel(provider);
            storeBatchSummaries(params, summaries, source);
            finishJob(jobId, { summaries, source });
            console.log(`[job ${jobId.slice(0, 8)}] Done — ${Object.values(summaries).filter(Boolean).length} tabs`);
        }
        catch (e) {
            const message = e.message;
            if (!allowTemplateFallback()) {
                failJob(jobId, message);
                console.error(`[job ${jobId.slice(0, 8)}] ${provider} failed:`, message);
                return;
            }
            try {
                const metrics = await metricsForSummaries(params);
                const templateInsights = metrics.tab_insights || buildTabInsights(metrics);
                finishJob(jobId, { summaries: templateInsights, source: 'template-fallback', warning: message });
                console.warn(`[job ${jobId.slice(0, 8)}] ${provider} failed — template fallback:`, message);
            }
            catch (inner) {
                failJob(jobId, message);
                console.error(`[job ${jobId.slice(0, 8)}] Failed:`, message);
            }
        }
    })();
    return res.json({
        _job_id: jobId,
        _cached: false,
        status: 'running',
        provider,
        source: summaryProviderLabel(provider),
    });
});
summariesRouter.get('/warmup', async (_req, res) => {
    try {
        if (sqlConfigured()) {
            await warmupWarehouse();
            return res.json({ ok: true, message: 'SQL warehouse warmed up' });
        }
        return res.json({ ok: true, message: 'SQL not configured — skipped' });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
    }
});
summariesRouter.get('/preload/status', (_req, res) => {
    res.json(getPreloadStatus());
});
summariesRouter.post('/console-data', async (req, res) => {
    const filters = (req.body?.filters || {});
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
            }
            catch (e) {
                failJob(jobId, e.message);
                console.error(`[job ${jobId.slice(0, 8)}] Metrics refresh failed:`, e.message);
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
    }
    catch (e) {
        const message = e.message;
        return res.status(503).json({
            error: message,
            metrics: null,
            _source: 'error',
            _cached: true,
            metric_view: resolveMetricView(),
        });
    }
});
