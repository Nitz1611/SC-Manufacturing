/**
 * Claude Opus summaries via Databricks Model Serving.
 * Default AI path for tab narratives; Supervisor Agent is optional via SUMMARY_PROVIDER=supervisor.
 */
import type { MetricsPayload } from '../../shared/types/dashboard.js';
import { buildFilterContext, buildMetricsGroundingContext, type SummaryEntity } from './summaryPrompts.js';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const PROFESSIONAL_VOICE = `You are a senior manufacturing operations analyst writing an executive briefing for plant leadership.
Focus ONLY on unplanned downtime. Use ONLY numbers from the dashboard metrics block — never invent values.
Write 2–4 polished sentences in professional business English (not a robotic data dump).
Lead with the most important insight (performance vs prior period or benchmark).
Name specific sites, periods, categories, lines, or reasons from the data when relevant.
End with one clear, actionable recommendation for plant managers.
Do not use bullet points, markdown, headers, or JSON in the narrative text.
Vary sentence openings — avoid starting every summary with "Unplanned DT % is".`;

const TAB_FOCUS: Record<SummaryEntity, string> = {
  overview: 'Overall unplanned DT performance: KPI level, peak/low periods, STOPS, and one priority action.',
  category: 'Top downtime categories by site and period — which category drives the most loss.',
  line: 'Worst line-level contributors and site/line combinations to address first.',
  dow: 'Day-of-week and shift patterns — when unplanned DT concentrates across weeks.',
  reason: 'Top root-cause reasons by hours and period trend — what to fix first.',
};

function host(): string {
  return (process.env.DATABRICKS_HOST || process.env.DATABRICKS_SERVER_HOSTNAME || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function token(): string {
  return process.env.DATABRICKS_PAT_TOKEN || process.env.DATABRICKS_TOKEN || '';
}

/** Default Databricks Claude serving endpoint name. */
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

function claudeApiMode(): 'invocations' | 'anthropic' | 'auto' {
  const mode = String(process.env.CLAUDE_API_MODE || 'auto').toLowerCase();
  if (mode === 'anthropic' || mode === 'messages') return 'anthropic';
  if (mode === 'invocations' || mode === 'chat') return 'invocations';
  return 'auto';
}

export function isRoboticTemplateSummary(text: string): boolean {
  return /^Unplanned DT % is \d/.test(String(text || '').trim());
}

export function claudeStatus(): Record<string, unknown> {
  return {
    configured: claudeConfigured(),
    host: host() || 'NOT SET',
    endpoint: claudeEndpoint(),
    api_mode: claudeApiMode(),
  };
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

async function invokeClaudeInvocations(messages: ChatMessage[]): Promise<string> {
  const h = host();
  const url = `https://${h}/serving-endpoints/${claudeEndpoint()}/invocations`;
  const body = {
    messages,
    max_tokens: Number(process.env.CLAUDE_MAX_TOKENS || 800),
    temperature: Number(process.env.CLAUDE_TEMPERATURE || 0.2),
  };

  console.log(`[claude] invocations → ${claudeEndpoint()} (${messages.length} messages)…`);
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
    throw new Error(`Claude invocations HTTP ${resp.status}: ${errText.slice(0, 400)}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const text = extractText(data);
  if (!text) throw new Error('Claude invocations returned empty content');
  console.log(`[claude] ✓ invocations ${text.length} chars in ${Date.now() - started}ms`);
  return text;
}

async function invokeClaudeAnthropic(messages: ChatMessage[]): Promise<string> {
  const h = host();
  const url = `https://${h}/serving-endpoints/anthropic/v1/messages`;
  const system = messages.find(m => m.role === 'system')?.content;
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model: claudeEndpoint(),
    max_tokens: Number(process.env.CLAUDE_MAX_TOKENS || 800),
    temperature: Number(process.env.CLAUDE_TEMPERATURE || 0.2),
    messages: chatMessages.length ? chatMessages : [{ role: 'user', content: messages[messages.length - 1]?.content || '' }],
  };
  if (system) body.system = system;

  console.log(`[claude] anthropic/messages → ${claudeEndpoint()}…`);
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
    throw new Error(`Claude anthropic HTTP ${resp.status}: ${errText.slice(0, 400)}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const blocks = data.content as Array<{ type?: string; text?: string }> | undefined;
  const text = blocks?.map(b => b.text || '').join('').trim() || extractText(data);
  if (!text) throw new Error('Claude anthropic returned empty content');
  console.log(`[claude] ✓ anthropic ${text.length} chars in ${Date.now() - started}ms`);
  return text;
}

export async function invokeClaude(messages: ChatMessage[]): Promise<string> {
  const mode = claudeApiMode();
  if (mode === 'anthropic') return invokeClaudeAnthropic(messages);
  if (mode === 'invocations') return invokeClaudeInvocations(messages);

  try {
    return await invokeClaudeInvocations(messages);
  } catch (first) {
    console.warn(`[claude] invocations failed (${(first as Error).message.slice(0, 120)}) — trying anthropic/messages`);
    return invokeClaudeAnthropic(messages);
  }
}

export async function getClaudeTabSummary(
  entityType: SummaryEntity,
  filters: Record<string, unknown>,
  metrics: MetricsPayload,
): Promise<{ narrative: string; source: 'claude' }> {
  const filterCtx = buildFilterContext(filters);
  const grounding = buildMetricsGroundingContext(metrics, entityType);

  const user = `${PROFESSIONAL_VOICE}

Tab focus: ${TAB_FOCUS[entityType]}
Applied filters: ${filterCtx}

${grounding}

Return JSON only: {"narrative":"your 2-4 sentence executive summary"}`;

  const raw = await invokeClaude([
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
  const grounding = buildMetricsGroundingContext(metrics, 'overview');

  const user = `${PROFESSIONAL_VOICE}

Applied filters: ${filterCtx}

${grounding}

Additional metrics JSON (categories, lines, reasons, shifts):
${JSON.stringify(compactMetrics(metrics), null, 2)}

Write a distinct executive summary for each KPI tab below.
Return ONLY valid JSON with these keys (each value is a 2-4 sentence string):
{
  "overview": "...",
  "category": "...",
  "line": "...",
  "dow": "...",
  "reason": "..."
}`;

  const raw = await invokeClaude([
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
