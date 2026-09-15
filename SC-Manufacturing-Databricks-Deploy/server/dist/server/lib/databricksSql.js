/**
 * Databricks SQL Statement Execution API — live queries against pgt_plnt_prodtn_metric_view.
 */
import { databricksFetch, databricksHost, databricksToken } from './databricksFetch.js';
function host() {
    return databricksHost();
}
function token() {
    return databricksToken();
}
export function sqlConfigured() {
    return Boolean(host() && token() && process.env.DATABRICKS_WAREHOUSE_ID);
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
function extractRows(stmt) {
    const result = stmt.result;
    const manifest = stmt.manifest;
    if (result?.data_array && Array.isArray(result.data_array)) {
        const cols = (manifest?.schema?.columns || []).map(c => c.name || '');
        return result.data_array.map(row => {
            const obj = {};
            cols.forEach((col, i) => {
                if (col)
                    obj[col] = row[i];
            });
            return obj;
        });
    }
    if (Array.isArray(result))
        return result;
    return [];
}
async function pollStatement(statementId) {
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
        const stmt = (await resp.json());
        const state = stmt.status?.state;
        if (state === 'SUCCEEDED')
            return stmt;
        if (state === 'FAILED' || state === 'CANCELED') {
            const err = stmt.status?.error?.message;
            throw new Error(err || `SQL statement ${state}`);
        }
        await sleep(state === 'PENDING' ? 1500 : 800);
    }
    throw new Error('Databricks SQL timed out waiting for results');
}
export async function executeStatement(sql) {
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
    let stmt = (await resp.json());
    const state = stmt.status?.state;
    if (state !== 'SUCCEEDED') {
        stmt = await pollStatement(String(stmt.statement_id));
    }
    const rows = extractRows(stmt);
    console.log(`[databricks] ✓ ${rows.length} rows`);
    return rows;
}
export async function warmupWarehouse() {
    if (!sqlConfigured())
        return;
    await executeStatement('SELECT 1 AS ok');
}
