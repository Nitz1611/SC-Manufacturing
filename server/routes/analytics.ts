import { Router } from 'express';
import type { QueryKey } from '../../shared/types/dashboard.js';
import { runAnalyticsQuery } from '../lib/analytics.js';

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
  res.json({ ok: true, message: 'Warehouse warmup ping' });
});

analyticsRouter.get('/status', (_req, res) => {
  res.json({
    ok: true,
    architecture: 'vr-dashboard',
    warehouse: process.env.DATABRICKS_WAREHOUSE_ID || 'NOT SET',
    catalog: process.env.DATABRICKS_CATALOG || 'main',
    mode: process.env.DATABRICKS_WAREHOUSE_ID ? 'sql+cache-fallback' : 'cache-only',
  });
});
