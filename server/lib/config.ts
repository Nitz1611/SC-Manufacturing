import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const QUERIES_DIR = path.join(ROOT, 'config', 'queries');
export const CACHE_FILE = path.join(ROOT, 'cache.json');

/** Gold-table defaults for pgt_plnt_prodtn_metric_view (UC semantic layer column names). */
const GOLD = {
  date: '`Production Date`',
  period: "CONCAT('P', CAST(`Production Period` AS STRING))",
  week: "CONCAT(CAST(YEAR(`Production Date`) AS STRING), 'P', LPAD(CAST(`Production Period` AS STRING), 2, '0'), 'W', LPAD(CAST(`Production week` AS STRING), 2, '0'))",
  shift: 'CAST(`Shift` AS STRING)',
  line: '`Line Desc`',
  category: '`Downtime Category`',
  reason: '`Downtime Reason`',
  dtPct: '`Unplanned Downtime %`',
  dtHours: '`Unplanned Downtime Hours`',
  stops: 'STOPS',
  dtTypeFilter: "TRIM(`Downtime Type`) IN ('Unplanned', 'Unspecified')",
};

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
  return process.env.DATABRICKS_DATE_COLUMN?.trim() || GOLD.date;
}

export function periodExpression(): string {
  return process.env.DATABRICKS_PERIOD_EXPR?.trim() || GOLD.period;
}

export function weekExpression(): string {
  return process.env.DATABRICKS_WEEK_EXPR?.trim() || GOLD.week;
}

export function shiftExpression(): string {
  return process.env.DATABRICKS_SHIFT_EXPR?.trim() || GOLD.shift;
}

export function lineColumn(): string {
  return process.env.DATABRICKS_LINE_COLUMN?.trim() || GOLD.line;
}

export function categoryColumn(): string {
  return process.env.DATABRICKS_CATEGORY_COLUMN?.trim() || GOLD.category;
}

export function reasonColumn(): string {
  return process.env.DATABRICKS_REASON_COLUMN?.trim() || GOLD.reason;
}

export function dtPctColumn(): string {
  return process.env.DATABRICKS_DT_PCT_COLUMN?.trim() || GOLD.dtPct;
}

export function dtHoursColumn(): string {
  return process.env.DATABRICKS_DT_HOURS_COLUMN?.trim() || GOLD.dtHours;
}

export function stopsColumn(): string {
  return process.env.DATABRICKS_STOPS_COLUMN?.trim() || GOLD.stops;
}

export function dtTypeFilter(): string {
  return process.env.DATABRICKS_DT_TYPE_FILTER?.trim() || GOLD.dtTypeFilter;
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
    .replace(/\{\{date_col\}\}/g, dateColumn())
    .replace(/\{\{line_col\}\}/g, lineColumn())
    .replace(/\{\{category_col\}\}/g, categoryColumn())
    .replace(/\{\{reason_col\}\}/g, reasonColumn())
    .replace(/\{\{dt_pct\}\}/g, dtPctColumn())
    .replace(/\{\{dt_hours\}\}/g, dtHoursColumn())
    .replace(/\{\{stops_col\}\}/g, stopsColumn())
    .replace(/\{\{dt_type_filter\}\}/g, dtTypeFilter());
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

export function sqlColumnSummary() {
  return {
    date_column: dateColumn(),
    period_expr: periodExpression(),
    week_expr: weekExpression(),
    dt_pct: dtPctColumn(),
    dt_hours: dtHoursColumn(),
    line: lineColumn(),
    category: categoryColumn(),
    reason: reasonColumn(),
  };
}
