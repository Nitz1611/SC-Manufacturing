/**
 * Background preload — one SQL load per year×region (All sites) then fan-out
 * all site/timeframe cache keys in memory for instant filter changes.
 */
import {
  getFreshMetricsBundle,
  getMemoryCacheStats,
  refreshMetricsBundle,
  resolveMetricsBundle,
  runAnalyticsQuery,
  warmMemoryCacheFromDisk,
} from './analytics.js';
import { buildFilterOptions } from './metricsTransform.js';
import { sqlConfigured } from './databricksSql.js';

const INTERVAL_MS = Number(process.env.PRELOAD_INTERVAL_MINUTES || 15) * 60 * 1000;
const CONCURRENCY = Math.max(1, Number(process.env.PRELOAD_CONCURRENCY || 6));
const DEFAULT_YEAR = String(process.env.PRELOAD_DEFAULT_YEAR || '2026');

export function preloadEnabled(): boolean {
  return String(process.env.PRELOAD_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export interface PreloadStatus {
  enabled: boolean;
  running: boolean;
  ready: boolean;
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
  queueLength: number;
}

const status: PreloadStatus = {
  enabled: preloadEnabled(),
  running: false,
  ready: false,
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
  queueLength: 0,
};

let schedulerStarted = false;
let nextRunTimer: ReturnType<typeof setTimeout> | null = null;
const priorityQueue: Record<string, unknown>[] = [];
const queuedKeys = new Set<string>();

function comboKey(combo: Record<string, unknown>): string {
  return JSON.stringify({
    year: combo.year,
    site: 'All',
    region: combo.region || [],
    timeframe: combo.timeframe || 'Week',
  });
}

async function loadFilterCombinations(): Promise<Record<string, unknown>[]> {
  const { rows } = await runAnalyticsQuery('dashboard_filter_options', {});
  const options = buildFilterOptions(rows as Record<string, unknown>[]);
  const years = options.years.length ? options.years.map(String) : [DEFAULT_YEAR];
  const regionSets: (string[] | null)[] = [null, ...options.regions.map(r => [r])];

  const combos: Record<string, unknown>[] = [];
  for (const year of years) {
    for (const region of regionSets) {
      combos.push({
        year,
        site: 'All',
        region: region || [],
        timeframe: 'Week',
      });
    }
  }

  combos.sort((a, b) => {
    const score = (c: Record<string, unknown>) => {
      let s = 0;
      if (String(c.year) === DEFAULT_YEAR) s += 100;
      if (!c.region || (Array.isArray(c.region) && c.region.length === 0)) s += 50;
      return s;
    };
    return score(b) - score(a);
  });

  return combos;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function next(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

export function prioritizePreloadCombo(filters: Record<string, unknown>): void {
  if (!preloadEnabled()) return;
  const combo = {
    year: filters.year || DEFAULT_YEAR,
    site: 'All',
    region: filters.region || [],
    timeframe: filters.timeframe || 'Week',
  };
  const key = comboKey(combo);
  if (queuedKeys.has(key) || resolveMetricsBundle(combo)) return;
  priorityQueue.unshift(combo);
  queuedKeys.add(key);
  status.queueLength = priorityQueue.length;
  console.log(`[preload] prioritized ${key.slice(0, 80)}`);
}

async function refreshCombo(combo: Record<string, unknown>): Promise<void> {
  if (getFreshMetricsBundle(combo)) {
    status.combinationsSkipped++;
    return;
  }
  await refreshMetricsBundle(combo, msg => {
    if (status.combinationsDone % 5 === 0) {
      console.log(`[preload] ${status.combinationsDone}/${status.combinationsTotal} — ${msg}`);
    }
  });
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
    const baseCombos = await loadFilterCombinations();
    const pending = [...priorityQueue, ...baseCombos.filter(c => !queuedKeys.has(comboKey(c)))];
    priorityQueue.length = 0;
    queuedKeys.clear();
    status.queueLength = 0;

    status.combinationsTotal = pending.length;
    console.log(
      `[preload] starting cycle — ${pending.length} network bundles (all sites fan-out), concurrency=${CONCURRENCY}`,
    );

    await runPool(pending, CONCURRENCY, async combo => {
      try {
        await refreshCombo(combo);
      } catch (e) {
        console.warn('[preload] combo failed:', comboKey(combo).slice(0, 80), (e as Error).message);
      }
      status.combinationsDone++;
    });

    status.memoryCacheEntries = getMemoryCacheStats().entries;
    status.lastRunFinishedAt = Date.now();
    status.ready = status.combinationsDone > 0;
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
    queueLength: priorityQueue.length,
    ready: status.ready || getMemoryCacheStats().entries > 0,
  };
}
