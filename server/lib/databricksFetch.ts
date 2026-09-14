/**
 * Shared HTTPS fetch for Databricks APIs — proxy support + actionable network errors.
 */
import { fetch as undiciFetch, ProxyAgent } from 'undici';

type FetchInit = Parameters<typeof undiciFetch>[1];

let proxyLogged = false;

export function databricksHost(): string {
  return (process.env.DATABRICKS_HOST || process.env.DATABRICKS_SERVER_HOSTNAME || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

export function databricksToken(): string {
  return process.env.DATABRICKS_PAT_TOKEN || process.env.DATABRICKS_TOKEN || '';
}

function proxyUrl(): string | undefined {
  return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || undefined;
}

function proxyDispatcher() {
  const proxy = proxyUrl();
  if (!proxy) return undefined;
  if (!proxyLogged) {
    console.log(`[databricks] using HTTPS proxy ${proxy}`);
    proxyLogged = true;
  }
  return new ProxyAgent(proxy);
}

function errorCode(err: unknown): string | undefined {
  const cause = (err as { cause?: unknown })?.cause;
  if (cause && typeof cause === 'object' && cause !== null && 'code' in cause) {
    return String((cause as { code?: string }).code || '');
  }
  if (err && typeof err === 'object' && err !== null && 'code' in err) {
    return String((err as { code?: string }).code || '');
  }
  return undefined;
}

function errorCauseMessage(err: unknown): string {
  const cause = (err as { cause?: unknown })?.cause;
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause) {
    return String((cause as { message?: string }).message || '');
  }
  return '';
}

/** Turn low-level fetch failures into guidance for corporate/VPN/proxy setups. */
export function formatFetchError(err: unknown, url: string): string {
  const message = err instanceof Error ? err.message : String(err);
  const code = errorCode(err);
  const cause = errorCauseMessage(err);
  const host = databricksHost() || '(DATABRICKS_HOST not set)';
  const parts = [`Cannot reach ${url}`];
  if (code) parts.push(`code=${code}`);
  if (cause && cause !== message) parts.push(cause);

  const hints: string[] = [];
  if (code === 'ENOTFOUND' || message.includes('getaddrinfo')) {
    hints.push(`check DATABRICKS_HOST (${host}) — use your workspace hostname like adb-1234567890123456.7.azuredatabricks.net`);
  }
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    hints.push('connect to corporate VPN if required');
    hints.push('set HTTPS_PROXY in .env if your network uses a proxy');
  }
  if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    hints.push('set NODE_EXTRA_CA_CERTS to your corporate root CA bundle');
  }
  if (!proxyUrl() && (code === 'ETIMEDOUT' || message === 'fetch failed')) {
    hints.push('try HTTPS_PROXY=http://your-proxy:8080 in .env');
  }

  if (hints.length) parts.push(`Hints: ${hints.join('; ')}`);
  return parts.join(' — ');
}

export async function databricksFetch(url: string, init: FetchInit = {}): Promise<Response> {
  const dispatcher = proxyDispatcher();
  try {
    return await undiciFetch(url, dispatcher ? { ...init, dispatcher } : init);
  } catch (err) {
    throw new Error(formatFetchError(err, url));
  }
}

export async function testDatabricksReachability(): Promise<{
  ok: boolean;
  host: string;
  status?: number;
  error?: string;
  error_code?: string;
  proxy?: string | null;
}> {
  const host = databricksHost();
  const proxy = proxyUrl() || null;
  if (!host) {
    return { ok: false, host: '', proxy, error: 'DATABRICKS_HOST or DATABRICKS_SERVER_HOSTNAME is not set' };
  }

  const token = databricksToken();
  const url = `https://${host}/api/2.0/clusters/list?page_size=1`;
  try {
    const resp = await databricksFetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    // Any HTTP response means the network path works (even 401/403).
    return { ok: true, host, status: resp.status, proxy };
  } catch (err) {
    return {
      ok: false,
      host,
      proxy,
      error: err instanceof Error ? err.message : String(err),
      error_code: errorCode(err),
    };
  }
}
