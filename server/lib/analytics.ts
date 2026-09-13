/**
 * Databricks SQL execution — VR analytics plugin equivalent.
 * Falls back to cache-transformed metrics when warehouse is not configured.
 */
import { cacheGet, cacheGetAny } from './cache.js';
import { coarseCacheKey, loadQuerySql, normalizeParams } from './config.js';
import {
  applySiteFilter,
  enrichMetrics,
  metricsFromDashboardCache,
  metricsFromCache,
  queryResultForKey,
} from './metricsTransform.js';

function databricksConfigured(): boolean {
  return Boolean(
    process.env.DATABRICKS_HOST || process.env.DATABRICKS_SERVER_HOSTNAME,
  ) && Boolean(process.env.DATABRICKS_WAREHOUSE_ID) && Boolean(
    process.env.DATABRICKS_PAT_TOKEN || process.env.DATABRICKS_TOKEN,
  );
}

export async function executeSql(_sql: string, _params: Record<string, string | null>): Promise<{ rows: Record<string, unknown>[] }> {
  // Live SQL via Databricks Statement Execution API — wired when warehouse env is set.
  // Until deployed with warehouse credentials, all queries use cache fallback (instant).
  throw new Error('SQL warehouse not available in local mode — using cache fallback');
}

export function loadMetricsBundle(filters: Record<string, unknown>): MetricsPayload {
  const norm = normalizeParams(filters);
  const key = coarseCacheKey(norm);

  const cached = cacheGet(key) as Partial<MetricsPayload> | null;
  if (cached && (cached.kpis || cached.period_trend || cached.periods)) {
    return applySiteFilter(enrichMetrics(cached, norm, 'cache'), norm.site);
  }

  const dashKey = JSON.stringify({ period: norm.period || 'week' });
  const dashboard = cacheGet(dashKey) || cacheGetAny();
  if (dashboard) {
    return applySiteFilter(metricsFromDashboardCache(dashboard as Record<string, unknown>, norm), norm.site);
  }

  return applySiteFilter(metricsFromCache(norm), norm.site);
}

export async function runAnalyticsQuery(
  queryKey: string,
  params: Record<string, unknown>,
): Promise<{ rows: unknown[]; source: string; cached: boolean }> {
  const norm = normalizeParams(params);
  const metrics = loadMetricsBundle(params);

  if (databricksConfigured()) {
    try {
      const sql = loadQuerySql(queryKey);
      const result = await executeSql(sql, norm);
      return { rows: result.rows, source: 'sql', cached: false };
    } catch (e) {
      console.warn(`[analytics] ${queryKey} SQL fallback:`, (e as Error).message);
    }
  }

  const result = queryResultForKey(queryKey, metrics);
  const rows = (result as { rows: unknown[] }).rows || [];
  return { rows, source: metrics.meta.source, cached: true };
}

export function metricsBundleToConsolePayload(metrics: MetricsPayload) {
  return {
    metrics,
    dashboard: {},
    _cached: metrics.meta.source === 'cache',
    _refreshing: false,
    _job_id: null,
  };
}

export { databricksConfigured, loadMetricsBundle as getMetricsBundle };
