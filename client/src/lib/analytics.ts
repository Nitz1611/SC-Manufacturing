import type { AnalyticsParams, QueryKey } from '@shared/types/dashboard';

export interface AnalyticsQueryResult<T = Record<string, unknown>> {
  rows: T[];
  loading: boolean;
  error: string | null;
  source: string;
  cached: boolean;
  refetch: () => void;
}

const queryCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_MS = 60_000;

function paramsKey(queryKey: string, params: AnalyticsParams): string {
  return `${queryKey}:${JSON.stringify(params)}`;
}

export async function fetchAnalyticsQuery<T = Record<string, unknown>>(
  queryKey: QueryKey,
  params: AnalyticsParams,
  force = false,
): Promise<{ rows: T[]; source: string; cached: boolean }> {
  const key = paramsKey(queryKey, params);
  if (!force) {
    const hit = queryCache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_MS) {
      const d = hit.data as { rows: T[]; source: string; cached: boolean };
      return d;
    }
  }

  const res = await fetch(`/api/analytics/query/${queryKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params }),
  });
  if (!res.ok) throw new Error(`Analytics query failed: ${res.status}`);
  const data = await res.json();
  const out = { rows: (data.rows || []) as T[], source: data.source || 'cache', cached: !!data._cached };
  queryCache.set(key, { data: out, ts: Date.now() });
  return out;
}

/** VR Dashboard pattern — mirrors useAnalyticsQuery from AppKit UI */
export function useAnalyticsQuery<T = Record<string, unknown>>(
  queryKey: QueryKey,
  params: AnalyticsParams,
): AnalyticsQueryResult<T> {
  // Imperative helper for legacy bridge; React hook wrapper in useAnalyticsQueryReact.ts
  throw new Error('Use useAnalyticsQueryReact in React components, or fetchAnalyticsQuery directly');
}

export function clearAnalyticsCache(): void {
  queryCache.clear();
}
