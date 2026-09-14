import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnalyticsParams, QueryKey } from '@shared/types/dashboard';
import { fetchAnalyticsQuery, type AnalyticsQueryResult } from '../lib/analytics';

/**
 * Standard hook — one named SQL query per call.
 * Params must be memoized at call site to avoid refetch loops.
 */
export function useAnalyticsQuery<T = Record<string, unknown>>(
  queryKey: QueryKey,
  params: AnalyticsParams,
): AnalyticsQueryResult<T> {
  const paramsStable = useMemo(() => JSON.stringify(params), [params]);
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState('cache');
  const [cached, setCached] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const parsedParams = JSON.parse(paramsStable) as AnalyticsParams;
      const result = await fetchAnalyticsQuery<T>(queryKey, parsedParams, force);
      setRows(result.rows);
      setSource(result.source);
      setCached(result.cached);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [queryKey, paramsStable]);

  useEffect(() => {
    load(false);
  }, [load]);

  return {
    rows,
    loading,
    error,
    source,
    cached,
    refetch: () => load(true),
  };
}
