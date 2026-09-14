import { Router } from 'express';
import type { QueryKey } from '../../shared/types/dashboard.js';
import { databricksConfigured, getLastSqlError, getLastSqlSuccessAt, resolveMetricView, runAnalyticsQuery, verifyMetricViewAccess } from '../lib/analytics.js';
import { sqlEnvStatus } from '../lib/env.js';
import { consoleDemoMode, sqlColumnSummary } from '../lib/config.js';
import { runningJobCount } from '../lib/jobs.js';
import { describeSummaryProvider } from '../lib/summaryProvider.js';
import { supervisorConfigured } from '../lib/supervisor.js';
import { sqlConfigured, warmupWarehouse } from '../lib/databricksSql.js';
import { getPreloadStatus } from '../lib/preload.js';

const VALID_KEYS: QueryKey[] = [
  'dashboard_dt_kpis',
  'dashboard_dt_period_trend',
  'dashboard_dt_site_by_period',
  'dashboard_dt_category_by_period',
  'dashboard_dt_line_by_period',
  'dashboard_dt_reasons',
  'dashboard_dt_dow',
  'dashboard_dt_top_lines',
  'dashboard_dt_shift_comparison',
  'dashboard_dt_dow_by_shift',
  'dashboard_filter_options',
];

export const analyticsRouter = Router();

analyticsRouter.post('/analytics/query/:queryKey', async (req, res) => {
  const queryKey = req.params.queryKey as QueryKey;
  if (!VALID_KEYS.includes(queryKey)) {
    return res.status(404).json({ error: `Unknown query: ${queryKey}` });
  }

  const params = (req.body?.params || req.body || {}) as Record<string, unknown>;
  const started = Date.now();

  try {
    const result = await runAnalyticsQuery(queryKey, params);
    return res.json({
      query_key: queryKey,
      rows: result.rows,
      row_count: result.rows.length,
      source: result.source,
      _cached: result.cached,
      elapsed_ms: Date.now() - started,
    });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

analyticsRouter.get('/warmup', async (_req, res) => {
  try {
    if (sqlConfigured()) {
      await warmupWarehouse();
      return res.json({ ok: true, message: 'SQL warehouse warmed up' });
    }
    return res.json({ ok: true, message: 'SQL not configured' });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

analyticsRouter.get('/status', async (_req, res) => {
  const configured = databricksConfigured();
  const env = sqlEnvStatus();
  const metricView = resolveMetricView();
  const sqlTest = configured ? await verifyMetricViewAccess() : { ok: false, error: 'SQL not configured' };

  res.json({
    ok: true,
    architecture: 'sc-manufacturing',
    sql_configured: configured,
    sql_ok: sqlTest.ok,
    sql_test: sqlTest,
    last_sql_error: getLastSqlError(),
    last_sql_success_at: getLastSqlSuccessAt(),
    repo_root: env.repo_root,
    cwd: env.cwd,
    env_file: env.env_file,
    env_search: env.env_search,
    env_vars_set: {
      host: env.host_set,
      token: env.token_set,
      warehouse: env.warehouse_set,
    },
    missing_env: env.missing,
    warehouse: process.env.DATABRICKS_WAREHOUSE_ID || 'NOT SET',
    host: process.env.DATABRICKS_HOST || process.env.DATABRICKS_SERVER_HOSTNAME || 'NOT SET',
    catalog: process.env.DATABRICKS_CATALOG || 'main',
    schema: process.env.DATABRICKS_SCHEMA || '(not set — two-part view name)',
    metric_view: metricView,
    sql_columns: sqlColumnSummary(),
    mode: sqlTest.ok
      ? 'live-sql-metric-view'
      : configured
        ? 'sql-error'
        : consoleDemoMode()
          ? 'demo-fallback'
          : 'production-no-demo',
    demo_mode: consoleDemoMode(),
    ...describeSummaryProvider(),
    supervisor: supervisorConfigured() ? process.env.SUPERVISOR_ENDPOINT_NAME : 'not configured',
    active_supervisor_jobs: runningJobCount(),
    preload: getPreloadStatus(),
  });
});
