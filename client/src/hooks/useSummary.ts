import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnalyticsParams } from '@shared/types/dashboard';

export type SummaryEntity = 'overview' | 'category' | 'line' | 'dow' | 'reason';

interface SummaryResult {
  narrative: string;
  loading: boolean;
  error: string | null;
  cached: boolean;
  refresh: () => void;
}

const summaryClientCache = new Map<string, string>();

/** VR Dashboard /api/summaries pattern — AI narrative separate from chart SQL */
export function useSummary(entityType: SummaryEntity, params: AnalyticsParams): SummaryResult {
  const paramsStable = useMemo(() => JSON.stringify(params), [params]);
  const [narrative, setNarrative] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const load = useCallback(async (forceRefresh = false) => {
    const cacheKey = `${entityType}:${paramsStable}`;
    if (!forceRefresh && summaryClientCache.has(cacheKey)) {
      setNarrative(summaryClientCache.get(cacheKey)!);
      setCached(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          params: JSON.parse(paramsStable),
          forceRefresh,
        }),
      });
      if (!res.ok) throw new Error(`Summary failed: ${res.status}`);
      const data = await res.json();
      setNarrative(data.narrative || '');
      setCached(!!data.cached);
      summaryClientCache.set(cacheKey, data.narrative || '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [entityType, paramsStable]);

  useEffect(() => {
    load(false);
  }, [load]);

  return { narrative, loading, error, cached, refresh: () => load(true) };
}
