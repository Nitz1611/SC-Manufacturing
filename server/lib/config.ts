import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const QUERIES_DIR = path.join(ROOT, 'config', 'queries');
export const CACHE_FILE = path.join(ROOT, 'cache.json');

/** Gold-table defaults for pgt_plnt_prodtn_metric_view (UC semantic layer column names). */
const GOLD_NAMES = {
  date: 'Production Date',
  period: 'Production Period',
  week: 'Production week',
  shift: 'Shift',
  line: 'Line Desc',
  category: 'Downtime Category',
  reason: 'Downtime Reason',
  dtPct: 'Unplanned Downtime %',
  dtHours: 'Unplanned Downtime Hours',
  dtType: 'Downtime Type',
  stops: 'STOPS',
  site: 'Site',
  region: 'Region',
};

/** Backtick-quote identifiers with spaces or special characters (Databricks SQL). */
export function quoteIdent(name: string): string {
  const t = name.trim();
  if (!t) return t;
  if (t.startsWith('`') && t.endsWith('`')) return t;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) return t;
  return `\`${t.replace(/`/g, '``')}\``;
}

function resolveColumn(envKey: string, defaultName: string): string {
  const raw = process.env[envKey]?.trim();
  if (raw && (raw.includes('(') || /\bCONCAT\b/i.test(raw) || /\bCAST\b/i.test(raw))) {
    return raw;
  }
  return quoteIdent(raw || defaultName);
}

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
  return resolveColumn('DATABRICKS_DATE_COLUMN', GOLD_NAMES.date);
}

export function periodExpression(): string {
  const raw = process.env.DATABRICKS_PERIOD_EXPR?.trim();
  if (raw) return raw;
  const p = quoteIdent(GOLD_NAMES.period);
  return `CONCAT('P', CAST(${p} AS STRING))`;
}

export function periodSortColumn(): string {
  return quoteIdent(GOLD_NAMES.period);
}

export function weekExpression(): string {
  const raw = process.env.DATABRICKS_WEEK_EXPR?.trim();
  if (raw) return raw;
  const dt = dateColumn();
  const p = quoteIdent(GOLD_NAMES.period);
  const w = quoteIdent(GOLD_NAMES.week);
  return `CONCAT(CAST(YEAR(${dt}) AS STRING), 'P', LPAD(CAST(${p} AS STRING), 2, '0'), 'W', LPAD(CAST(${w} AS STRING), 2, '0'))`;
}

export function shiftExpression(): string {
  const raw = process.env.DATABRICKS_SHIFT_EXPR?.trim();
  if (raw) return raw;
  return `CAST(${quoteIdent(GOLD_NAMES.shift)} AS STRING)`;
}

export function lineColumn(): string {
  return resolveColumn('DATABRICKS_LINE_COLUMN', GOLD_NAMES.line);
}

export function categoryColumn(): string {
  return resolveColumn('DATABRICKS_CATEGORY_COLUMN', GOLD_NAMES.category);
}

export function reasonColumn(): string {
  return resolveColumn('DATABRICKS_REASON_COLUMN', GOLD_NAMES.reason);
}

export function siteColumn(): string {
  return resolveColumn('DATABRICKS_SITE_COLUMN', GOLD_NAMES.site);
}

export function regionColumn(): string {
  return resolveColumn('DATABRICKS_REGION_COLUMN', GOLD_NAMES.region);
}

/** Runtime region filter — replaced in bindSqlParams via {{region_filter}} */
export function buildRegionFilterSql(regionsCsv: string | null): string {
  if (!regionsCsv) return '1=1';
  const col = regionColumn();
  const list = regionsCsv
    .split(',')
    .map(r => r.trim())
    .filter(Boolean)
    .map(r => `'${r.replace(/'/g, "''")}'`)
    .join(', ');
  if (!list) return '1=1';
  return `TRIM(${col}) IN (${list})`;
}

export function dtPctColumn(): string {
  return resolveColumn('DATABRICKS_DT_PCT_COLUMN', GOLD_NAMES.dtPct);
}

export function dtHoursColumn(): string {
  return resolveColumn('DATABRICKS_DT_HOURS_COLUMN', GOLD_NAMES.dtHours);
}

export function stopsColumn(): string {
  return resolveColumn('DATABRICKS_STOPS_COLUMN', GOLD_NAMES.stops);
}

export function dtTypeFilter(): string {
  const raw = process.env.DATABRICKS_DT_TYPE_FILTER?.trim();
  if (raw) return raw;
  const col = quoteIdent(GOLD_NAMES.dtType);
  return `TRIM(${col}) IN ('Unplanned', 'Unspecified')`;
}

/** UC metric views require MEASURE() — AVG/SUM on measure columns is invalid. */
function measureExpr(columnExpr: string): string {
  return `MEASURE(${columnExpr})`;
}

export function dtPctMeasure(): string {
  return measureExpr(dtPctColumn());
}

export function dtHoursMeasure(): string {
  return measureExpr(dtHoursColumn());
}

export function stopsMeasure(): string {
  return measureExpr(stopsColumn());
}

export function yearFilterExpression(): string {
  return `(:year IS NULL OR YEAR(${dateColumn()}) = :year)`;
}

function applySqlFragments(sql: string): string {
  return sql
    .replace(/\{\{year_filter\}\}/g, yearFilterExpression())
    .replace(/\(:year IS NULL OR Year = :year\)/gi, yearFilterExpression())
    .replace(/\{\{period_expr\}\}/g, periodExpression())
    .replace(/\{\{period_sort\}\}/g, periodSortColumn())
    .replace(/\{\{week_expr\}\}/g, weekExpression())
    .replace(/\{\{shift_expr\}\}/g, shiftExpression())
    .replace(/\{\{date_col\}\}/g, dateColumn())
    .replace(/\{\{line_col\}\}/g, lineColumn())
    .replace(/\{\{category_col\}\}/g, categoryColumn())
    .replace(/\{\{reason_col\}\}/g, reasonColumn())
    .replace(/\{\{site_col\}\}/g, siteColumn())
    .replace(/\{\{region_col\}\}/g, regionColumn())
    .replace(/\{\{dt_pct\}\}/g, dtPctColumn())
    .replace(/\{\{dt_hours\}\}/g, dtHoursColumn())
    .replace(/\{\{stops_col\}\}/g, stopsColumn())
    .replace(/\{\{dt_pct_m\}\}/g, dtPctMeasure())
    .replace(/\{\{dt_hours_m\}\}/g, dtHoursMeasure())
    .replace(/\{\{stops_m\}\}/g, stopsMeasure())
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

/** Bind :year, :site, and {{region_filter}} for SQL execution */
export function bindSqlParams(sql: string, params: Record<string, string | null>): string {
  const yearLit = params.year ? String(params.year) : 'NULL';
  const siteLit = params.site
    ? `'${params.site.replace(/'/g, "''").toUpperCase()}'`
    : 'NULL';
  const regionFilter = buildRegionFilterSql(params.regions ?? null);
  return sql
    .replace(/:year\b/g, yearLit)
    .replace(/:site\b/g, siteLit)
    .replace(/\{\{region_filter\}\}/g, regionFilter);
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
  let regions: string | null = null;
  if (Array.isArray(raw.region) && raw.region.length) {
    regions = raw.region.map(String).join(',');
  } else if (typeof raw.region === 'string' && raw.region.trim()) {
    regions = raw.region.trim();
  }
  return { period, year, site, timeframe, regions };
}

export function coarseCacheKey(params: Record<string, string | null>): string {
  return `metrics_${JSON.stringify({
    period: params.period || 'week',
    year: params.year || '2026',
    site: params.site || null,
    regions: params.regions || null,
  })}`;
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
    site: siteColumn(),
    region: regionColumn(),
  };
}
