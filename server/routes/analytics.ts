import { Router } from 'express';
import type { QueryKey } from '../../shared/types/dashboard.js';
import { databricksConfigured, runAnalyticsQuery } from '../lib/analytics.js';
import { sqlEnvStatus } from '../lib/env.js';
import { sqlConfigured, warmupWarehouse } from '../lib/databricksSql.js';

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

analyticsRouter.get('/status', (_req, res) => {
  const configured = databricksConfigured();
  const env = sqlEnvStatus();
  res.json({
    ok: true,
    architecture: 'sc-manufacturing',
    sql_configured: configured,
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
    metric_view: process.env.DATABRICKS_METRIC_VIEW || '(catalog).pgt_plnt_prodtn_metric_view',
    mode: configured ? 'live-sql-metric-view' : 'demo-fallback',
    supervisor: 'not used for chart data',
  });
});
