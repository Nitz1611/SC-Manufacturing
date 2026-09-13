/**
 * Analytics — live SQL against pgt_plnt_prodtn_metric_view.
 * When SQL is configured, never serves synthetic demo data on failure.
 */
import type { MetricsPayload, QueryKey } from '../../shared/types/dashboard.js';
import { cacheGet, cacheSet } from './cache.js';
import { bindSqlParams, coarseCacheKey, loadQuerySql, normalizeParams, resolveMetricView } from './config.js';
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

const MEMORY_TTL_MS = Number(process.env.METRICS_MEMORY_CACHE_MINUTES || 15) * 60 * 1000;
const memoryCache = new Map<string, { data: MetricsPayload; ts: number }>();

let lastSqlError: string | null = null;
let lastSqlSuccessAt: number | null = null;

export function databricksConfigured(): boolean {
  return sqlConfigured();
}

export function getLastSqlError(): string | null {
  return lastSqlError;
}

export function getLastSqlSuccessAt(): number | null {
  return lastSqlSuccessAt;
}

function rememberSqlError(err: unknown): never {
  const msg = (err as Error).message || String(err);
  lastSqlError = msg;
  throw new Error(
    `Live SQL failed for ${resolveMetricView()}: ${msg}. ` +
    'Set DATABRICKS_METRIC_VIEW in .env to the exact catalog.schema.view from Databricks.',
  );
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
  lastSqlError = null;
  lastSqlSuccessAt = Date.now();
  cacheSet(coarseCacheKey(norm), metrics as unknown as Record<string, unknown>);
  return metrics;
}

function loadPriorSqlCache(filters: Record<string, unknown>): MetricsPayload | null {
  const norm = normalizeParams(filters);
  const key = coarseCacheKey(norm);
  const cached = cacheGet(key) as Partial<MetricsPayload> | null;
  if (cached && (cached.kpis || cached.period_trend) && cached.meta?.source === 'sql') {
    return applySiteFilter(enrichMetrics(cached, norm, 'cache'), norm.site);
  }
  return null;
}

function loadMetricsFromDemoFallback(filters: Record<string, unknown>): MetricsPayload {
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

function getMemoryCached(norm: Record<string, string | null>): MetricsPayload | null {
  const key = coarseCacheKey(norm);
  const hit = memoryCache.get(key);
  if (!hit || Date.now() - hit.ts > MEMORY_TTL_MS) return null;
  return applySiteFilter(hit.data, norm.site);
}

function setMemoryCached(norm: Record<string, string | null>, metrics: MetricsPayload): void {
  memoryCache.set(coarseCacheKey(norm), { data: metrics, ts: Date.now() });
}

export async function getMetricsBundle(filters: Record<string, unknown> = {}): Promise<MetricsPayload> {
  const norm = normalizeParams(filters);
  const mem = getMemoryCached(norm);
  if (mem) return mem;

  if (sqlConfigured()) {
    try {
      console.log(`[analytics] Loading live data from ${resolveMetricView()}…`);
      const metrics = await loadMetricsFromSql(norm);
      setMemoryCached(norm, metrics);
      return applySiteFilter(metrics, norm.site);
    } catch (err) {
      console.error('[analytics] Live SQL failed:', (err as Error).message);
      const prior = loadPriorSqlCache(filters);
      if (prior) {
        prior.meta.source = 'cache';
        setMemoryCached(norm, prior);
        return prior;
      }
      rememberSqlError(err);
    }
  }

  const demo = loadMetricsFromDemoFallback(filters);
  setMemoryCached(norm, demo);
  return demo;
}

export async function runAnalyticsQuery(
  queryKey: QueryKey,
  params: Record<string, unknown>,
): Promise<{ rows: unknown[]; source: string; cached: boolean }> {
  const norm = normalizeParams(params);

  if (sqlConfigured()) {
    try {
      const rows = await executeQuery(queryKey, norm);
      lastSqlError = null;
      lastSqlSuccessAt = Date.now();
      return { rows, source: 'sql', cached: false };
    } catch (e) {
      lastSqlError = (e as Error).message;
      console.warn(`[analytics] ${queryKey} live SQL failed:`, lastSqlError);
      const prior = loadPriorSqlCache(params);
      if (prior) {
        const result = queryResultForKey(queryKey, prior);
        return { rows: (result as { rows: unknown[] }).rows || [], source: 'cache', cached: true };
      }
      throw e;
    }
  }

  const metrics = loadMetricsFromDemoFallback(params);
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

export async function verifyMetricViewAccess(): Promise<{ ok: boolean; row_count?: number; error?: string }> {
  if (!sqlConfigured()) {
    return { ok: false, error: 'SQL not configured' };
  }
  try {
    const sql = `SELECT COUNT(*) AS row_count FROM ${resolveMetricView()} LIMIT 1`;
    const rows = await executeStatement(sql);
    lastSqlError = null;
    lastSqlSuccessAt = Date.now();
    return { ok: true, row_count: Number(rows[0]?.row_count ?? 0) };
  } catch (e) {
    lastSqlError = (e as Error).message;
    return { ok: false, error: lastSqlError };
  }
}

export { warmupWarehouse, resolveMetricView };
