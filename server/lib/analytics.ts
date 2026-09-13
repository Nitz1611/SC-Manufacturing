/**
 * Analytics — live SQL against pgt_plnt_prodtn_metric_view with cache fallback.
 */
import type { QueryKey } from '../../shared/types/dashboard.js';
import { cacheGet, cacheSet } from './cache.js';
import { bindSqlParams, coarseCacheKey, loadQuerySql, normalizeParams } from './config.js';
import { executeStatement, sqlConfigured, warmupWarehouse } from './databricksSql.js';
import {
  applySiteFilter,
  buildMetricsFromSql,
  enrichMetrics,
  metricsFromCache,
  metricsFromDashboardCache,
  queryResultForKey,
  type SqlQueryResults,
} from './metricsTransform.js';
import type { MetricsPayload } from '../../shared/types/dashboard.js';

const QUERY_KEYS: QueryKey[] = [
  'dashboard_dt_kpis',
  'dashboard_dt_period_trend',
  'dashboard_dt_site_by_period',
  'dashboard_dt_category_by_period',
  'dashboard_dt_line_by_period',
  'dashboard_dt_reasons',
  'dashboard_dt_dow',
  'dashboard_dt_top_lines',
  'dashboard_dt_shift_comparison',
];

export function databricksConfigured(): boolean {
  return sqlConfigured();
}

async function executeQuery(
  queryKey: QueryKey,
  params: Record<string, string | null>,
): Promise<Record<string, unknown>[]> {
  const sql = bindSqlParams(loadQuerySql(queryKey), params);
  return executeStatement(sql);
}

async function loadMetricsFromSql(norm: Record<string, string | null>): Promise<MetricsPayload> {
  const [
    kpis,
    periodTrend,
    siteByPeriod,
    categoryByPeriod,
    lineByPeriod,
    reasons,
    dow,
    topLines,
    shiftComparison,
  ] = await Promise.all([
    executeQuery('dashboard_dt_kpis', norm),
    executeQuery('dashboard_dt_period_trend', norm),
    executeQuery('dashboard_dt_site_by_period', norm),
    executeQuery('dashboard_dt_category_by_period', norm),
    executeQuery('dashboard_dt_line_by_period', norm),
    executeQuery('dashboard_dt_reasons', norm),
    executeQuery('dashboard_dt_dow', norm),
    executeQuery('dashboard_dt_top_lines', norm),
    executeQuery('dashboard_dt_shift_comparison', norm),
  ]);

  const results: SqlQueryResults = {
    kpis,
    periodTrend,
    siteByPeriod,
    categoryByPeriod,
    lineByPeriod,
    reasons,
    dow,
    topLines,
    shiftComparison,
  };

  const metrics = buildMetricsFromSql(results, norm);
  cacheSet(coarseCacheKey(norm), metrics as unknown as Record<string, unknown>);
  return metrics;
}

function loadMetricsFromCacheFallback(filters: Record<string, unknown>): MetricsPayload {
  const norm = normalizeParams(filters);
  const key = coarseCacheKey(norm);

  const cached = cacheGet(key) as Partial<MetricsPayload> | null;
  if (cached && (cached.kpis || cached.period_trend) && cached.meta?.source === 'sql') {
    return applySiteFilter(enrichMetrics(cached, norm, 'cache'), norm.site);
  }

  const dashKey = JSON.stringify({ period: norm.period || 'week' });
  const dashboard = cacheGet(dashKey);
  if (dashboard) {
    return applySiteFilter(metricsFromDashboardCache(dashboard as Record<string, unknown>, norm), norm.site);
  }

  return applySiteFilter(metricsFromCache(norm), norm.site);
}

export async function getMetricsBundle(filters: Record<string, unknown> = {}): Promise<MetricsPayload> {
  const norm = normalizeParams(filters);

  if (sqlConfigured()) {
    try {
      console.log('[analytics] Loading live data from pgt_plnt_prodtn_metric_view…');
      const metrics = await loadMetricsFromSql(norm);
      return applySiteFilter(metrics, norm.site);
    } catch (err) {
      console.error('[analytics] Live SQL failed:', (err as Error).message);
      const fallback = loadMetricsFromCacheFallback(filters);
      fallback.meta.source = 'cache';
      return applySiteFilter(fallback, norm.site);
    }
  }

  return loadMetricsFromCacheFallback(filters);
}

export async function runAnalyticsQuery(
  queryKey: QueryKey,
  params: Record<string, unknown>,
): Promise<{ rows: unknown[]; source: string; cached: boolean }> {
  const norm = normalizeParams(params);

  if (sqlConfigured()) {
    try {
      const rows = await executeQuery(queryKey, norm);
      return { rows, source: 'sql', cached: false };
    } catch (e) {
      console.warn(`[analytics] ${queryKey} live SQL failed:`, (e as Error).message);
    }
  }

  const metrics = loadMetricsFromCacheFallback(params);
  const result = queryResultForKey(queryKey, metrics);
  const rows = (result as { rows: unknown[] }).rows || [];
  return { rows, source: metrics.meta.source, cached: true };
}

export function metricsBundleToConsolePayload(metrics: MetricsPayload) {
  return {
    metrics,
    dashboard: {},
    _cached: metrics.meta.source !== 'sql',
    _refreshing: false,
    _job_id: null,
    _source: metrics.meta.source,
  };
}

export { warmupWarehouse };
