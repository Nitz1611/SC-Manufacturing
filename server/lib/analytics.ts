/**
 * Analytics — live SQL against pgt_plnt_prodtn_metric_view.
 * When SQL is configured, never serves synthetic demo data on failure.
 */
import type { MetricsPayload, QueryKey } from '../../shared/types/dashboard.js';
import { cacheGet, cacheLoadAllMetrics, cacheSet } from './cache.js';
import { bindSqlParams, coarseCacheKey, consoleDemoMode, loadQuerySql, normalizeParams, resolveMetricView } from './config.js';
import { executeStatement, sqlConfigured, warmupWarehouse } from './databricksSql.js';
import {
  applySiteFilter,
  buildMetricsFromSql,
  metricsFromCache,
  metricsFromDashboardCache,
  queryResultForKey,
  type SqlQueryResults,
} from './metricsTransform.js';

const MEMORY_TTL_MS = Number(process.env.METRICS_MEMORY_CACHE_MINUTES || 15) * 60 * 1000;
const PERIOD_VARIANTS = ['week', 'month', 'quarter', 'fiscal_year'] as const;
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

/** Run SQL in two waves to avoid hammering the warehouse with 11 concurrent scans. */
async function loadMetricsFromSql(
  norm: Record<string, string | null>,
  onProgress?: (message: string) => void,
): Promise<MetricsPayload> {
  onProgress?.('Querying KPIs, sites, and trends…');
  const [
    kpis,
    periodTrend,
    siteByPeriod,
    reasons,
    dow,
    topLines,
    shiftComparison,
    filterOptions,
  ] = await Promise.all([
    executeQuery('dashboard_dt_kpis', norm),
    executeQuery('dashboard_dt_period_trend', norm),
    executeQuery('dashboard_dt_site_by_period', norm),
    executeQuery('dashboard_dt_reasons', norm),
    executeQuery('dashboard_dt_dow', norm),
    executeQuery('dashboard_dt_top_lines', norm),
    executeQuery('dashboard_dt_shift_comparison', norm),
    executeQuery('dashboard_filter_options', norm),
  ]);

  onProgress?.('Querying category, line, and shift breakdowns…');
  const [categoryByPeriod, lineByPeriod, categoryNetwork, lineNetwork, dowByShift] = await Promise.all([
    executeQuery('dashboard_dt_category_by_period', norm),
    executeQuery('dashboard_dt_line_by_period', norm),
    executeQuery('dashboard_dt_category_network', norm),
    executeQuery('dashboard_dt_line_network', norm),
    executeQuery('dashboard_dt_dow_by_shift', norm),
  ]);

  const results: SqlQueryResults = {
    kpis,
    periodTrend,
    siteByPeriod,
    categoryByPeriod,
    lineByPeriod,
    categoryNetwork,
    lineNetwork,
    reasons,
    dow,
    dowByShift,
    topLines,
    shiftComparison,
    filterOptions,
  };

  const metrics = buildMetricsFromSql(results, norm);
  lastSqlError = null;
  lastSqlSuccessAt = Date.now();
  return metrics;
}

function loadPriorSqlCache(filters: Record<string, unknown>): MetricsPayload | null {
  const norm = normalizeParams(filters);
  const key = coarseCacheKey(norm);
  const cached = cacheGet(key) as MetricsPayload | null;
  if (cached?.kpis && cached.meta?.source === 'sql') {
    return applySiteFilter(structuredClone(cached), norm.site);
  }
  return null;
}

function loadMetricsFromDemoFallback(filters: Record<string, unknown>): MetricsPayload {
  const norm = normalizeParams(filters);
  const key = coarseCacheKey(norm);

  const cached = cacheGet(key) as Partial<MetricsPayload> | null;
  if (cached?.kpis && cached.meta?.source === 'sql') {
    return applySiteFilter(structuredClone(cached as MetricsPayload), norm.site);
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

/** Store metrics under all timeframe cache keys — SQL ignores period, UI does not. */
export function storeMetricsBundleToCache(
  norm: Record<string, string | null>,
  metrics: MetricsPayload,
): void {
  for (const period of PERIOD_VARIANTS) {
    const keyNorm: Record<string, string | null> = { ...norm, period };
    const scoped = applySiteFilter(metrics, keyNorm.site);
    setMemoryCached(keyNorm, scoped);
    cacheSet(coarseCacheKey(keyNorm), scoped as unknown as Record<string, unknown>);
  }
}

export function getMemoryCacheStats(): { entries: number; keys: string[] } {
  return { entries: memoryCache.size, keys: [...memoryCache.keys()] };
}

/** Load valid disk cache entries into memory on startup (no SQL change). */
export function warmMemoryCacheFromDisk(): number {
  let loaded = 0;
  for (const entry of cacheLoadAllMetrics()) {
    try {
      const parsed = JSON.parse(entry.key.replace(/^metrics_/, '')) as {
        period?: string;
        year?: string | null;
        site?: string | null;
        regions?: string | null;
      };
      const norm: Record<string, string | null> = {
        period: parsed.period || 'week',
        year: parsed.year ? String(parsed.year) : '2026',
        site: parsed.site || null,
        regions: parsed.regions || null,
        timeframe: parsed.period || 'week',
      };
      const key = coarseCacheKey(norm);
      if (!memoryCache.has(key)) {
        memoryCache.set(key, { data: entry.data as MetricsPayload, ts: entry.ts });
        loaded++;
      }
    } catch {
      // skip malformed keys
    }
  }
  if (loaded) console.log(`[cache] warmed ${loaded} metrics bundle(s) from disk into memory`);
  return loaded;
}

/** Return cached metrics if available (memory or disk), without hitting SQL. */
export function getCachedMetricsBundle(filters: Record<string, unknown> = {}): MetricsPayload | null {
  const norm = normalizeParams(filters);
  return getMemoryCached(norm) || loadPriorSqlCache(filters);
}

/** Return in-memory cache only (fresh within TTL). */
export function getFreshMetricsBundle(filters: Record<string, unknown> = {}): MetricsPayload | null {
  const norm = normalizeParams(filters);
  return getMemoryCached(norm);
}

/** Refresh metrics from SQL and update caches. Used by background console-data jobs. */
export async function refreshMetricsBundle(
  filters: Record<string, unknown>,
  onProgress?: (message: string) => void,
): Promise<MetricsPayload> {
  const norm = normalizeParams(filters);
  const metrics = await loadMetricsFromSql(norm, onProgress);
  const scoped = applySiteFilter(metrics, norm.site);
  storeMetricsBundleToCache(norm, metrics);
  return scoped;
}

export async function getMetricsBundle(filters: Record<string, unknown> = {}): Promise<MetricsPayload> {
  const norm = normalizeParams(filters);
  const mem = getMemoryCached(norm);
  if (mem) return mem;

  if (sqlConfigured()) {
    try {
      console.log(`[analytics] Loading live data from ${resolveMetricView()}…`);
      const metrics = await loadMetricsFromSql(norm);
      storeMetricsBundleToCache(norm, metrics);
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

  if (!consoleDemoMode()) {
    throw new Error(
      'Live SQL is not configured. Set DATABRICKS_* in .env, or set CONSOLE_DEMO_MODE=true to enable demo data.',
    );
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

  if (!consoleDemoMode()) {
    throw new Error(
      'Live SQL is not configured. Set DATABRICKS_* in .env, or set CONSOLE_DEMO_MODE=true to enable demo data.',
    );
  }

  const metrics = loadMetricsFromDemoFallback(params);
  const result = queryResultForKey(queryKey, metrics);
  const rows = (result as { rows: unknown[] }).rows || [];
  return { rows, source: metrics.meta.source, cached: true };
}

export function metricsBundleToConsolePayload(
  metrics: MetricsPayload | null,
  extras: { _job_id?: string | null; _refreshing?: boolean; fromCache?: boolean } = {},
) {
  const fromCache = extras.fromCache ?? false;
  return {
    metrics,
    dashboard: {},
    _cached: fromCache || (metrics ? metrics.meta.source !== 'sql' : true),
    _refreshing: extras._refreshing ?? false,
    _job_id: extras._job_id ?? null,
    _source: fromCache ? 'cache' : (metrics?.meta?.source ?? 'loading'),
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
