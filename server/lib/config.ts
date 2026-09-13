import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const QUERIES_DIR = path.join(ROOT, 'config', 'queries');
export const CACHE_FILE = path.join(ROOT, 'cache.json');

export function resolveMetricView(): string {
  if (process.env.DATABRICKS_METRIC_VIEW?.trim()) {
    return process.env.DATABRICKS_METRIC_VIEW.trim();
  }
  const catalog = process.env.DATABRICKS_CATALOG || 'main';
  const schema = process.env.DATABRICKS_SCHEMA?.trim();
  return schema
    ? `${catalog}.${schema}.pgt_plnt_prodtn_metric_view`
    : `${catalog}.pgt_plnt_prodtn_metric_view`;
}

export function dateColumn(): string {
  return process.env.DATABRICKS_DATE_COLUMN?.trim() || 'STRT_DT';
}

/** SQL expression for fiscal/network period label (P1…P10). Override if view has no Period column. */
export function periodExpression(): string {
  return process.env.DATABRICKS_PERIOD_EXPR?.trim() || 'Period';
}

/** SQL expression for fiscal week label. Override if view has no Week column. */
export function weekExpression(): string {
  return process.env.DATABRICKS_WEEK_EXPR?.trim() || 'Week';
}

/** SQL expression for shift grouping. */
export function shiftExpression(): string {
  return process.env.DATABRICKS_SHIFT_EXPR?.trim() || 'COALESCE(CAST(Shift AS STRING), CAST(SHIFT_KEY AS STRING))';
}

export function yearFilterExpression(): string {
  return `(:year IS NULL OR YEAR(${dateColumn()}) = :year)`;
}

function applySqlFragments(sql: string): string {
  return sql
    .replace(/\{\{year_filter\}\}/g, yearFilterExpression())
    .replace(/\(:year IS NULL OR Year = :year\)/gi, yearFilterExpression())
    .replace(/\{\{period_expr\}\}/g, periodExpression())
    .replace(/\{\{week_expr\}\}/g, weekExpression())
    .replace(/\{\{shift_expr\}\}/g, shiftExpression())
    .replace(/\{\{date_col\}\}/g, dateColumn());
}

export function loadQuerySql(queryKey: string): string {
  const file = path.join(QUERIES_DIR, `${queryKey}.obo.sql`);
  if (!fs.existsSync(file)) {
    throw new Error(`Query file not found: ${queryKey}.obo.sql`);
  }
  let sql = fs.readFileSync(file, 'utf-8');
  const metricView = resolveMetricView();
  sql = sql.replace(/\{\{catalog\}\}\.pgt_plnt_prodtn_metric_view/g, metricView);
  sql = sql.replace(/\{\{catalog\}\}/g, process.env.DATABRICKS_CATALOG || 'main');
  sql = applySqlFragments(sql);
  return sql.replace(/^--[^\n]*\n/gm, '').trim();
}

/** Bind :year and :site placeholders for local/dev SQL execution */
export function bindSqlParams(sql: string, params: Record<string, string | null>): string {
  const yearLit = params.year ? String(params.year) : 'NULL';
  const siteLit = params.site
    ? `'${params.site.replace(/'/g, "''").toUpperCase()}'`
    : 'NULL';
  return sql.replace(/:year\b/g, yearLit).replace(/:site\b/g, siteLit);
}

export function normalizeParams(raw: Record<string, unknown> = {}): Record<string, string | null> {
  const timeframe = String(raw.timeframe || raw.timeframe_mode || 'Week');
  const tfMap: Record<string, string> = {
    week: 'week',
    month: 'month',
    quarter: 'quarter',
    fy: 'fiscal_year',
    year: 'fiscal_year',
  };
  const period = tfMap[timeframe.toLowerCase()] || timeframe.toLowerCase();
  const year = raw.year && String(raw.year).toLowerCase() !== 'all' ? String(raw.year) : null;
  const site = raw.site && String(raw.site).toLowerCase() !== 'all' ? String(raw.site) : null;
  return { period, year, site, timeframe };
}

export function coarseCacheKey(params: Record<string, string | null>): string {
  return `metrics_${JSON.stringify({ period: params.period || 'week', year: params.year || '2026' })}`;
}
