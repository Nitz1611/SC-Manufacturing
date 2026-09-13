import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const QUERIES_DIR = path.join(ROOT, 'config', 'queries');
export const CACHE_FILE = path.join(ROOT, 'cache.json');

export function loadQuerySql(queryKey: string): string {
  const file = path.join(QUERIES_DIR, `${queryKey}.obo.sql`);
  if (!fs.existsSync(file)) {
    throw new Error(`Query file not found: ${queryKey}.obo.sql`);
  }
  let sql = fs.readFileSync(file, 'utf-8');
  const catalog = process.env.DATABRICKS_CATALOG || 'main';
  sql = sql.replace(/\{\{catalog\}\}/g, catalog);
  return sql.replace(/^--[^\n]*\n/gm, '').trim();
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
