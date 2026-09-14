/**
 * Background preload — refresh all filter combinations every N minutes so
 * console filter changes are served instantly from memory/disk cache.
 * AI summaries are NOT preloaded; those always go through Supervisor on demand.
 */
import {
  getFreshMetricsBundle,
  getMemoryCacheStats,
  refreshMetricsBundle,
  runAnalyticsQuery,
  warmMemoryCacheFromDisk,
} from './analytics.js';
import { buildFilterOptions } from './metricsTransform.js';
import { sqlConfigured } from './databricksSql.js';

const INTERVAL_MS = Number(process.env.PRELOAD_INTERVAL_MINUTES || 15) * 60 * 1000;
const CONCURRENCY = Math.max(1, Number(process.env.PRELOAD_CONCURRENCY || 3));
const DEFAULT_YEAR = String(process.env.PRELOAD_DEFAULT_YEAR || '2026');

export function preloadEnabled(): boolean {
  return String(process.env.PRELOAD_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export interface PreloadStatus {
  enabled: boolean;
  running: boolean;
  interval_minutes: number;
  concurrency: number;
  lastRunStartedAt: number | null;
  lastRunFinishedAt: number | null;
  lastRunError: string | null;
  combinationsTotal: number;
  combinationsDone: number;
  combinationsSkipped: number;
  memoryCacheEntries: number;
  nextRunAt: number | null;
}

const status: PreloadStatus = {
  enabled: preloadEnabled(),
  running: false,
  interval_minutes: INTERVAL_MS / 60000,
  concurrency: CONCURRENCY,
  lastRunStartedAt: null,
  lastRunFinishedAt: null,
  lastRunError: null,
  combinationsTotal: 0,
  combinationsDone: 0,
  combinationsSkipped: 0,
  memoryCacheEntries: 0,
  nextRunAt: null,
};

let schedulerStarted = false;
let nextRunTimer: ReturnType<typeof setTimeout> | null = null;

async function loadFilterCombinations(): Promise<Record<string, unknown>[]> {
  const { rows } = await runAnalyticsQuery('dashboard_filter_options', {});
  const options = buildFilterOptions(rows as Record<string, unknown>[]);
  const years = options.years.length ? options.years.map(String) : [DEFAULT_YEAR];
  const sites: (string | null)[] = [null, ...options.sites];
  const regionSets: (string[] | null)[] = [null, ...options.regions.map(r => [r])];

  const combos: Record<string, unknown>[] = [];
  for (const year of years) {
    for (const site of sites) {
      for (const region of regionSets) {
        combos.push({
          year,
          site: site || 'All',
          region: region || [],
          timeframe: 'Week',
        });
      }
    }
  }

  combos.sort((a, b) => {
    const score = (c: Record<string, unknown>) => {
      let s = 0;
      if (String(c.year) === DEFAULT_YEAR) s += 100;
      if (c.site === 'All') s += 50;
      if (!c.region || (Array.isArray(c.region) && c.region.length === 0)) s += 25;
      return s;
    };
    return score(b) - score(a);
  });

  return combos;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function next(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

export async function runPreloadCycle(): Promise<void> {
  if (!preloadEnabled() || !sqlConfigured()) return;
  if (status.running) {
    console.log('[preload] cycle already running — skip');
    return;
  }

  status.running = true;
  status.lastRunStartedAt = Date.now();
  status.lastRunError = null;
  status.combinationsDone = 0;
  status.combinationsSkipped = 0;

  try {
    const combos = await loadFilterCombinations();
    status.combinationsTotal = combos.length;
    console.log(`[preload] starting cycle — ${combos.length} combinations, concurrency=${CONCURRENCY}`);

    await runPool(combos, CONCURRENCY, async combo => {
      if (getFreshMetricsBundle(combo)) {
        status.combinationsSkipped++;
        status.combinationsDone++;
        return;
      }
      try {
        await refreshMetricsBundle(combo, msg => {
          if (status.combinationsDone % 10 === 0) {
            console.log(`[preload] ${status.combinationsDone}/${status.combinationsTotal} — ${msg}`);
          }
        });
      } catch (e) {
        console.warn('[preload] combo failed:', JSON.stringify(combo).slice(0, 80), (e as Error).message);
      }
      status.combinationsDone++;
    });

    status.memoryCacheEntries = getMemoryCacheStats().entries;
    status.lastRunFinishedAt = Date.now();
    const elapsed = ((status.lastRunFinishedAt - status.lastRunStartedAt!) / 1000).toFixed(0);
    console.log(
      `[preload] cycle complete — ${status.combinationsDone}/${status.combinationsTotal} ` +
      `(${status.combinationsSkipped} skipped fresh) in ${elapsed}s, ` +
      `${status.memoryCacheEntries} memory keys`,
    );
  } catch (e) {
    status.lastRunError = (e as Error).message;
    status.lastRunFinishedAt = Date.now();
    console.error('[preload] cycle failed:', status.lastRunError);
  } finally {
    status.running = false;
    status.memoryCacheEntries = getMemoryCacheStats().entries;
    scheduleNextRun();
  }
}

function scheduleNextRun(): void {
  if (!schedulerStarted || !preloadEnabled() || !sqlConfigured()) return;
  if (nextRunTimer) clearTimeout(nextRunTimer);
  status.nextRunAt = Date.now() + INTERVAL_MS;
  nextRunTimer = setTimeout(() => {
    void runPreloadCycle();
  }, INTERVAL_MS);
}

export function startPreloadScheduler(): void {
  if (schedulerStarted || !preloadEnabled() || !sqlConfigured()) return;
  schedulerStarted = true;
  status.enabled = true;
  warmMemoryCacheFromDisk();
  console.log(`[preload] scheduler started — every ${INTERVAL_MS / 60000} min, concurrency=${CONCURRENCY}`);
  void runPreloadCycle();
}

export function getPreloadStatus(): PreloadStatus {
  return {
    ...status,
    enabled: preloadEnabled(),
    interval_minutes: INTERVAL_MS / 60000,
    concurrency: CONCURRENCY,
    memoryCacheEntries: getMemoryCacheStats().entries,
  };
}
