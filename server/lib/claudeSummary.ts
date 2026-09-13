/**
 * VR-style AI summaries — Claude Opus via Databricks Model Serving.
 * Summarizes SQL metrics JSON directly (no Supervisor / Genie round-trip).
 */
import type { MetricsPayload } from '../../shared/types/dashboard.js';
import { buildFilterContext, type SummaryEntity } from './summaryPrompts.js';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const TAB_INSTRUCTIONS: Record<SummaryEntity, string> = {
  overview: 'Network KPI overview: DT %, hours, STOPS, period peak/low, one action.',
  category: 'Top Downtime Categories by site and period.',
  line: 'Top Line Desc contributors and worst site/line combos.',
  dow: 'Day-of-week and Shift patterns across weeks.',
  reason: 'Top Downtime Reasons by hours and period trend.',
};

function host(): string {
  return (process.env.DATABRICKS_HOST || process.env.DATABRICKS_SERVER_HOSTNAME || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function token(): string {
  return process.env.DATABRICKS_PAT_TOKEN || process.env.DATABRICKS_TOKEN || '';
}

/** Databricks Model Serving endpoint name (VR uses databricks-claude-opus-4-6). */
export function claudeEndpoint(): string {
  return (
    process.env.CLAUDE_SERVING_ENDPOINT
    || process.env.DATABRICKS_CLAUDE_ENDPOINT
    || 'databricks-claude-opus-4-6'
  );
}

export function claudeConfigured(): boolean {
  return Boolean(host() && token() && claudeEndpoint());
}

function topEntries(obj: Record<string, number[] | number>, n = 5): Record<string, unknown> {
  if (!obj) return {};
  const entries = Object.entries(obj);
  if (typeof entries[0]?.[1] === 'number') {
    return Object.fromEntries(
      entries.sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, n),
    );
  }
  return Object.fromEntries(entries.slice(0, n));
}

export function compactMetrics(metrics: MetricsPayload, entityType?: SummaryEntity): Record<string, unknown> {
  const base: Record<string, unknown> = {
    kpis: metrics.kpis,
    periods: metrics.periods,
    period_trend: metrics.period_trend,
    top_reasons: (metrics.reasons || []).slice(0, 5),
    top_lines: topEntries(metrics.top_lines || {}, 5),
    shift_comparison: (metrics.shift_comparison || []).slice(0, 3),
  };

  if (!entityType || entityType === 'overview') {
    base.top_sites = topEntries(metrics.site_by_period || {}, 5);
  }
  if (!entityType || entityType === 'category') {
    base.categories = topEntries(metrics.category_by_period || {}, 5);
  }
  if (!entityType || entityType === 'line') {
    base.lines = topEntries(metrics.line_by_period || {}, 5);
  }
  if (!entityType || entityType === 'dow') {
    base.dow_sample = Object.fromEntries(
      Object.entries(metrics.dow_by_day_week || {}).slice(0, 3),
    );
  }

  return base;
}

function extractText(data: Record<string, unknown>): string {
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  if (choices?.[0]?.message?.content) return choices[0].message.content.trim();

  if (typeof data.output === 'string') return data.output.trim();

  if (Array.isArray(data.output)) {
    for (const block of data.output) {
      if (block && typeof block === 'object') {
        const b = block as Record<string, unknown>;
        if (b.type === 'message' && Array.isArray(b.content)) {
          for (const cb of b.content) {
            if (cb && typeof cb === 'object') {
              const t = String((cb as Record<string, unknown>).text || '').trim();
              if (t) return t;
            }
          }
        }
      }
    }
  }

  const predictions = data.predictions as unknown[] | undefined;
  if (predictions?.[0]) {
    const p = predictions[0];
    if (typeof p === 'string') return p.trim();
    if (p && typeof p === 'object') {
      const po = p as Record<string, unknown>;
      if (typeof po.content === 'string') return po.content.trim();
      if (Array.isArray(po.candidates)) {
        const c = po.candidates[0] as Record<string, unknown> | undefined;
        if (typeof c?.text === 'string') return c.text.trim();
      }
    }
  }

  return '';
}

function parseNarrative(raw: string): string {
  const text = raw.trim();
  try {
    const d = JSON.parse(text) as Record<string, unknown>;
    if (typeof d.narrative === 'string') return d.narrative.trim();
  } catch {
    // plain text
  }
  const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
  try {
    const d = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof d.narrative === 'string') return d.narrative.trim();
  } catch {
    // plain text
  }
  return cleaned.slice(0, 600);
}

function parseBatchNarratives(raw: string): Partial<Record<SummaryEntity, string>> {
  const text = raw.replace(/```json\s*|```\s*/g, '').trim();
  try {
    const d = JSON.parse(text) as Record<string, unknown>;
    const out: Partial<Record<SummaryEntity, string>> = {};
    for (const tab of ['overview', 'category', 'line', 'dow', 'reason'] as SummaryEntity[]) {
      const v = d[tab];
      if (typeof v === 'string' && v.trim()) out[tab] = v.trim();
      else if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).narrative === 'string') {
        out[tab] = String((v as Record<string, unknown>).narrative).trim();
      }
    }
    if (Object.keys(out).length) return out;
  } catch {
    // fall through
  }
  return {};
}

export async function invokeClaude(messages: ChatMessage[]): Promise<string> {
  const h = host();
  const url = `https://${h}/serving-endpoints/${claudeEndpoint()}/invocations`;
  const body = {
    messages,
    max_tokens: Number(process.env.CLAUDE_MAX_TOKENS || 800),
    temperature: Number(process.env.CLAUDE_TEMPERATURE || 0.2),
  };

  console.log(`[claude] invoking ${claudeEndpoint()} (${messages.length} messages)…`);
  const started = Date.now();

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Claude serving HTTP ${resp.status}: ${errText.slice(0, 400)}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const text = extractText(data);
  if (!text) throw new Error('Claude serving returned empty content');
  console.log(`[claude] ✓ ${text.length} chars in ${Date.now() - started}ms`);
  return text;
}

export async function getClaudeTabSummary(
  entityType: SummaryEntity,
  filters: Record<string, unknown>,
  metrics: MetricsPayload,
): Promise<{ narrative: string; source: 'claude' }> {
  const filterCtx = buildFilterContext(filters);
  const system = `You are the SC Manufacturing analytics assistant.
Summarize UNPLANNED DOWNTIME ONLY for plant managers.
Use ONLY numbers from the provided metrics JSON — do not invent values.
Write exactly 2-4 plain-text sentences. No markdown, no bullet lists.`;

  const user = `Tab: ${entityType}
Focus: ${TAB_INSTRUCTIONS[entityType]}
Filters: ${filterCtx}
Metrics JSON:
${JSON.stringify(compactMetrics(metrics, entityType), null, 2)}

Return JSON: {"narrative":"your 2-4 sentence summary"}`;

  const raw = await invokeClaude([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  const narrative = parseNarrative(raw);
  if (!narrative) throw new Error('Claude returned empty narrative');
  return { narrative, source: 'claude' };
}

/** Single Claude call for all KPI tabs — faster than 5 separate invocations. */
export async function getClaudeBatchSummaries(
  filters: Record<string, unknown>,
  metrics: MetricsPayload,
): Promise<Record<SummaryEntity, string>> {
  const filterCtx = buildFilterContext(filters);
  const system = `You are the SC Manufacturing analytics assistant.
Summarize UNPLANNED DOWNTIME ONLY using the metrics JSON below.
Use ONLY provided numbers. Each tab needs 2-4 plain-text sentences.`;

  const user = `Filters: ${filterCtx}
Metrics JSON:
${JSON.stringify(compactMetrics(metrics), null, 2)}

Return ONLY valid JSON with these keys (each a string):
{
  "overview": "...",
  "category": "...",
  "line": "...",
  "dow": "...",
  "reason": "..."
}`;

  const raw = await invokeClaude([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  const parsed = parseBatchNarratives(raw);
  const tabs: SummaryEntity[] = ['overview', 'category', 'line', 'dow', 'reason'];
  const out = {} as Record<SummaryEntity, string>;

  for (const tab of tabs) {
    if (parsed[tab]) {
      out[tab] = parsed[tab]!;
    } else {
      const single = await getClaudeTabSummary(tab, filters, metrics);
      out[tab] = single.narrative;
    }
  }

  return out;
}
