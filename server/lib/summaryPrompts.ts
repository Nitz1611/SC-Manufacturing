/**
 * Tab-specific Supervisor prompts — unplanned DT only (SC Manufacturing Console).
 * Filters are injected at runtime; metrics JSON grounds Genie to dashboard periods.
 */
import type { MetricsPayload } from '../../shared/types/dashboard.js';
import { resolveMetricView } from './config.js';

export type SummaryEntity = 'overview' | 'category' | 'line' | 'dow' | 'reason';

function metricViewName(): string {
  return resolveMetricView();
}

const BASE_CONTEXT = (view: string) => `
You are the SC Manufacturing analytics supervisor agent.
Focus ONLY on UNPLANNED DOWNTIME (ignore waste metrics).
The dashboard charts and heatmaps are already loaded from SQL on: ${view}
Key dimensions: Site, Region, \`Line Desc\`, \`Downtime Category\`, \`Downtime Reason\`, \`Production Date\`, \`Production Period\`, \`Production week\`, Shift, \`Downtime Type\`
Key measures (use MEASURE() in SQL): \`Unplanned Downtime %\`, \`Unplanned Downtime Hours\`, STOPS
Filter unplanned rows: TRIM(\`Downtime Type\`) IN ('Unplanned', 'Unspecified')
Use the DASHBOARD METRICS block below as the authoritative source for periods, KPIs, and peak/low periods.
Do NOT mention any Production Period that is not listed in dashboard periods.
If Genie returns periods outside the dashboard list, ignore them and use the dashboard data only.
`.trim();

export const TAB_QUESTIONS: Record<SummaryEntity, (view: string) => string> = {
  overview: view => `
${BASE_CONTEXT(view)}

For the applied filters, summarize unplanned DT performance using ONLY the dashboard metrics block:
- Current Unplanned DT % and total Unplanned DT Hours
- STOPS count
- Peak and lowest period from the dashboard period_trend (not P1–P13 generically)
- One prescriptive action for plant managers

Return JSON only:
{"narrative":"2-4 sentences with exact numbers, sites, and periods from the dashboard metrics"}`,

  category: view => `
${BASE_CONTEXT(view)}

For the applied filters, analyze UNPLANNED DT by \`Downtime Category\` using dashboard metrics:
- Top 2–3 categories by average Unplanned DT % across visible dashboard periods only
- Which Site drives the highest category downtime
- Note trend only across periods listed in the dashboard

Return JSON only:
{"narrative":"2-4 sentences naming exact categories, sites, periods, and % values from dashboard data"}`,

  line: view => `
${BASE_CONTEXT(view)}

For the applied filters, analyze LINE-LEVEL unplanned DT using dashboard metrics and \`Line Desc\`:
- Top 3 lines by Unplanned DT % share
- Worst site/line combination across visible dashboard periods
- Specific mechanical or changeover focus area

Return JSON only:
{"narrative":"2-4 sentences naming exact line names, sites, and DT % values from dashboard data"}`,

  dow: view => `
${BASE_CONTEXT(view)}

For the applied filters, analyze DAY-OF-WEEK and SHIFT patterns from dashboard metrics:
- Highest Unplanned DT % days
- Which Shift (1/2/3) drives most Unplanned DT Hours
- Week-over-week pattern using visible dashboard weeks

Return JSON only:
{"narrative":"2-4 sentences naming days, shifts, weeks, and DT % / hours from dashboard data"}`,

  reason: view => `
${BASE_CONTEXT(view)}

For the applied filters, analyze ROOT CAUSES using dashboard metrics and \`Downtime Reason\`:
- Top 3 reasons by Unplanned DT Hours and % contribution
- Period trend using only visible dashboard periods (peak vs low)
- Priority fix ranked by hours impact

Return JSON only:
{"narrative":"2-4 sentences naming exact reasons, hours, % values, and periods from dashboard data"}`,
};

function peakLowFromTrend(periods: string[], trend: number[]) {
  if (!periods.length || !trend.length) return null;
  let peakI = -1;
  let lowI = -1;
  for (let i = 0; i < Math.min(periods.length, trend.length); i++) {
    const v = Number(trend[i]);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (peakI < 0 || v > Number(trend[peakI])) peakI = i;
    if (lowI < 0 || v < Number(trend[lowI])) lowI = i;
  }
  if (peakI < 0 || lowI < 0) return null;
  return {
    peakPeriod: periods[peakI],
    peakPct: trend[peakI],
    lowPeriod: periods[lowI],
    lowPct: trend[lowI],
  };
}

export function buildMetricsGroundingContext(
  metrics: MetricsPayload | null | undefined,
  entityType: SummaryEntity,
): string {
  if (!metrics?.periods?.length) {
    return 'DASHBOARD METRICS: (not available — use Genie with applied filters; only cite periods that exist in query results)';
  }

  const periods = metrics.periods;
  const trend = metrics.period_trend || [];
  const trendHrs = metrics.period_trend_hrs || [];
  const peakLow = peakLowFromTrend(periods, trend);
  const site = metrics.meta?.filtered_site || metrics.meta?.filters?.site || 'Network';
  const lines: string[] = [
    '=== DASHBOARD METRICS (authoritative — must match UI tables/charts) ===',
    `Site scope: ${site}`,
    `Visible periods ONLY: ${periods.join(', ')}`,
    `KPI Unplanned DT %: ${metrics.kpis?.downtime_pct?.value || 'N/A'}`,
    `KPI Unplanned DT Hours: ${metrics.kpis?.downtime_hrs?.value || 'N/A'}`,
    `KPI STOPS: ${metrics.kpis?.stops?.value || 'N/A'}`,
  ];

  if (peakLow) {
    lines.push(
      `Dashboard peak period: ${peakLow.peakPeriod} at ${peakLow.peakPct}% DT`,
      `Dashboard lowest period: ${peakLow.lowPeriod} at ${peakLow.lowPct}% DT`,
    );
  }

  const periodRows = periods.map((p, i) => {
    const pct = trend[i] != null ? `${Number(trend[i]).toFixed(2)}%` : '—';
    const hrs = trendHrs[i] != null ? `${Math.round(Number(trendHrs[i]))} h` : '';
    return `${p}: ${pct}${hrs ? `, ${hrs}` : ''}`;
  });
  lines.push(`period_trend: ${periodRows.join(' | ')}`);

  if (entityType === 'reason' && metrics.reasons?.length) {
    const top = metrics.reasons.slice(0, 5).map(r => `${r.reason} (${r.hours} h, ${r.pct}%)`);
    lines.push(`Top reasons: ${top.join('; ')}`);
  }

  if (entityType === 'category' && metrics.category_by_period) {
    const topCats = Object.entries(metrics.category_by_period)
      .map(([cat, vals]) => {
        const nums = vals.filter(v => v != null && Number(v) > 0);
        const avg = nums.length ? nums.reduce((a, b) => a + Number(b), 0) / nums.length : 0;
        return [cat, avg] as const;
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, avg]) => `${cat} (${avg.toFixed(2)}% avg)`);
    if (topCats.length) lines.push(`Top categories (dashboard): ${topCats.join('; ')}`);
  }

  lines.push(
    'RULE: Never mention a period label (e.g. P11) unless it appears in "Visible periods ONLY" above.',
  );
  return lines.join('\n');
}

export function buildFilterContext(filters: Record<string, unknown>): string {
  const parts: string[] = [];
  const map: Record<string, string> = {
    site: 'Site',
    region: 'Region',
    market: 'Market',
    year: 'Year',
    timeframe: 'Timeframe',
    showIn: 'ShowIn',
    period: 'Period',
  };
  for (const [key, label] of Object.entries(map)) {
    const v = filters[key];
    if (v == null || v === '' || String(v).toLowerCase() === 'all') continue;
    parts.push(`${label}=${v}`);
  }
  return parts.length ? parts.join(', ') : 'All sites, FY 2026, all regions';
}

export function buildSupervisorPrompt(
  entityType: SummaryEntity,
  filters: Record<string, unknown>,
  metrics?: MetricsPayload | null,
): string {
  const view = metricViewName();
  const ctx = buildFilterContext(filters);
  const grounding = buildMetricsGroundingContext(metrics, entityType);
  return `${TAB_QUESTIONS[entityType](view)}\n\nApplied filters: ${ctx}\n\n${grounding}\nReturn ONLY valid JSON — no markdown fences, no text before or after.`;
}
