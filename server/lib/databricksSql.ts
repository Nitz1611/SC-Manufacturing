/**
 * Databricks SQL Statement Execution API — live queries against pgt_plnt_prodtn_metric_view.
 */
import { databricksFetch, databricksHost, databricksToken } from './databricksFetch.js';

function host(): string {
  return databricksHost();
}

function token(): string {
  return databricksToken();
}

export function sqlConfigured(): boolean {
  return Boolean(host() && token() && process.env.DATABRICKS_WAREHOUSE_ID);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function extractRows(stmt: Record<string, unknown>): Record<string, unknown>[] {
  const result = stmt.result as Record<string, unknown> | undefined;
  const manifest = stmt.manifest as { schema?: { columns?: Array<{ name?: string }> } } | undefined;

  if (result?.data_array && Array.isArray(result.data_array)) {
    const cols = (manifest?.schema?.columns || []).map(c => c.name || '');
    return (result.data_array as unknown[][]).map(row => {
      const obj: Record<string, unknown> = {};
      cols.forEach((col, i) => {
        if (col) obj[col] = row[i];
      });
      return obj;
    });
  }

  if (Array.isArray(result)) return result as Record<string, unknown>[];
  return [];
}

async function pollStatement(statementId: string): Promise<Record<string, unknown>> {
  const h = host();
  const t = token();
  const url = `https://${h}/api/2.0/sql/statements/${statementId}`;

  for (let attempt = 0; attempt < 90; attempt++) {
    const resp = await databricksFetch(url, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Databricks poll failed (${resp.status}): ${text.slice(0, 400)}`);
    }
    const stmt = (await resp.json()) as Record<string, unknown>;
    const state = (stmt.status as { state?: string })?.state;

    if (state === 'SUCCEEDED') return stmt;
    if (state === 'FAILED' || state === 'CANCELED') {
      const err = (stmt.status as { error?: { message?: string } })?.error?.message;
      throw new Error(err || `SQL statement ${state}`);
    }
    await sleep(state === 'PENDING' ? 1500 : 800);
  }
  throw new Error('Databricks SQL timed out waiting for results');
}

export async function executeStatement(sql: string): Promise<Record<string, unknown>[]> {
  if (!sqlConfigured()) {
    throw new Error('Databricks SQL not configured — set DATABRICKS_HOST, DATABRICKS_PAT_TOKEN, DATABRICKS_WAREHOUSE_ID');
  }

  const h = host();
  const url = `https://${h}/api/2.0/sql/statements/`;
  const body = {
    warehouse_id: process.env.DATABRICKS_WAREHOUSE_ID,
    statement: sql,
    wait_timeout: '50s',
    format: 'JSON_ARRAY',
  };

  console.log(`[databricks] executing SQL (${sql.length} chars)…`);
  const resp = await databricksFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Databricks SQL POST failed (${resp.status}): ${text.slice(0, 500)}`);
  }

  let stmt = (await resp.json()) as Record<string, unknown>;
  const state = (stmt.status as { state?: string })?.state;

  if (state !== 'SUCCEEDED') {
    stmt = await pollStatement(String(stmt.statement_id));
  }

  const rows = extractRows(stmt);
  console.log(`[databricks] ✓ ${rows.length} rows`);
  return rows;
}

export async function warmupWarehouse(): Promise<void> {
  if (!sqlConfigured()) return;
  await executeStatement('SELECT 1 AS ok');
}
