/**
 * Tab-specific Supervisor prompts — unplanned DT only (SC Manufacturing Console).
 * Filters are injected at runtime.
 */

export type SummaryEntity = 'overview' | 'category' | 'line' | 'dow' | 'reason';

const VIEW = 'uc_dev_cgf_mdip_01.scm_gold.pgt_plnt_prodtn_metric_view';

const BASE_CONTEXT = `
You are the SC Manufacturing analytics supervisor agent.
Focus ONLY on UNPLANNED DOWNTIME (ignore waste metrics).
Query Genie using the metric view: ${VIEW}
Key dimensions: Site, Region, \`Line Desc\`, \`Downtime Category\`, \`Downtime Reason\`, \`Production Date\`, \`Production Period\`, \`Production week\`, Shift, \`Downtime Type\`
Key measures (use MEASURE() in SQL): \`Unplanned Downtime %\`, \`Unplanned Downtime Hours\`, STOPS
Filter unplanned rows: TRIM(\`Downtime Type\`) IN ('Unplanned', 'Unspecified')
Answer from live Genie data for the applied filters — do not invent numbers.
`.trim();

export const TAB_QUESTIONS: Record<SummaryEntity, string> = {
  overview: `
${BASE_CONTEXT}

For the applied filters, summarize NETWORK unplanned DT performance:
- Current Unplanned DT % and total Unplanned DT Hours
- STOPS count
- Peak and lowest \`Production Period\` (P1–P13) by Unplanned DT %
- One prescriptive action for plant managers

Return JSON only:
{"narrative":"2-4 sentences with exact numbers, sites, and periods from the data"}`,

  category: `
${BASE_CONTEXT}

For the applied filters, analyze UNPLANNED DT by \`Downtime Category\`:
- Top 2–3 categories by average Unplanned DT % across \`Production Period\`
- Which Site drives the highest category downtime
- Periods P8–P10 or latest periods if trend is rising

Return JSON only:
{"narrative":"2-4 sentences naming exact categories, sites, periods, and % values"}`,

  line: `
${BASE_CONTEXT}

For the applied filters, analyze LINE-LEVEL unplanned DT using \`Line Desc\`:
- Top 3 lines by Unplanned DT % share
- Worst site/line combination across periods
- Specific mechanical or changeover focus area

Return JSON only:
{"narrative":"2-4 sentences naming exact line names, sites, and DT % values"}`,

  dow: `
${BASE_CONTEXT}

For the applied filters, analyze DAY-OF-WEEK and SHIFT patterns:
- Highest Unplanned DT % days (from \`Production Date\`)
- Which Shift (1/2/3) drives most Unplanned DT Hours
- Week-over-week pattern using \`Production week\`

Return JSON only:
{"narrative":"2-4 sentences naming days, shifts, weeks, and DT % / hours"}`,

  reason: `
${BASE_CONTEXT}

For the applied filters, analyze ROOT CAUSES using \`Downtime Reason\`:
- Top 3 reasons by Unplanned DT Hours and % contribution
- Period trend (peak vs low \`Production Period\`)
- Priority fix ranked by hours impact

Return JSON only:
{"narrative":"2-4 sentences naming exact reasons, hours, % values, and periods"}`,
};

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

export function buildSupervisorPrompt(entityType: SummaryEntity, filters: Record<string, unknown>): string {
  const ctx = buildFilterContext(filters);
  return `${TAB_QUESTIONS[entityType]}\n\nApplied filters: ${ctx}\nReturn ONLY valid JSON — no markdown fences, no text before or after.`;
}
