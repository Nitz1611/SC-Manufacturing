/**
 * Databricks Supervisor Agent — VR Dashboard pattern.
 * Chart data from SQL cache; AI tab summaries via Supervisor → Genie (MAS endpoint).
 */
import type { MetricsPayload } from '../../shared/types/dashboard.js';
import { buildTabInsights } from './metricsTransform.js';
import { buildSupervisorPrompt, type SummaryEntity } from './summaryPrompts.js';

type Message = { role: string; content: string };
type SupervisorInput = Message | Record<string, unknown>;

const DEBUG = (process.env.SUPERVISOR_DEBUG || 'false').toLowerCase() === 'true';
const MAX_CONTINUATIONS = Math.max(1, Number(process.env.SUPERVISOR_MAX_CONTINUATIONS || 12));
const LONG_TASK = String(process.env.SUPERVISOR_LONG_TASK ?? 'true').toLowerCase() !== 'false';

function host(): string {
  return (process.env.DATABRICKS_HOST || process.env.DATABRICKS_SERVER_HOSTNAME || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function token(): string {
  return process.env.DATABRICKS_PAT_TOKEN || process.env.DATABRICKS_TOKEN || '';
}

function endpoint(): string {
  return process.env.SUPERVISOR_ENDPOINT_NAME || '';
}

export function supervisorConfigured(): boolean {
  return Boolean(host() && token() && endpoint());
}

function supervisorDatabricksOptions(): Record<string, unknown> {
  const opts: Record<string, unknown> = {};
  if (LONG_TASK) opts.long_task = true;
  return opts;
}

function isTimeoutResponse(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    (lower.includes('time out') || lower.includes('time limit') || lower.includes('timed out')) &&
    (lower.includes('continue') || lower.includes('would you like') || lower.includes('shall i'))
  );
}

function findTaskContinueCheckpoint(raw: string): { id: string; step?: number } | null {
  const idMatch = raw.match(/"type"\s*:\s*"task_continue_request"[\s\S]*?"id"\s*:\s*"(continue_[^"]+)"/);
  if (!idMatch) return null;
  const stepMatch = raw.match(/"type"\s*:\s*"task_continue_request"[\s\S]*?"step"\s*:\s*(\d+)/);
  return { id: idMatch[1], step: stepMatch ? Number(stepMatch[1]) : undefined };
}

function parseJsonBlock(raw: string): Record<string, unknown> {
  const text = raw.trim();
  try {
    const d = JSON.parse(text) as unknown;
    if (d && typeof d === 'object') return unwrapResponse(d as Record<string, unknown>);
  } catch {
    // continue
  }

  const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
  let best: Record<string, unknown> | null = null;
  let bestLen = 0;
  let depth = 0;
  let start: number | null = null;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start != null) {
        const candidate = cleaned.slice(start, i + 1);
        if (candidate.length > bestLen) {
          try {
            const d = JSON.parse(candidate) as Record<string, unknown>;
            if (d && Object.keys(d).length) {
              best = d;
              bestLen = candidate.length;
            }
          } catch {
            // skip
          }
        }
      }
    }
  }

  if (best) return unwrapResponse(best);
  if (looksLikeSseStream(cleaned)) return {};
  return { narrative: cleaned.slice(0, 500) };
}

function unwrapResponse(d: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(d.output)) {
    const allTexts: string[] = [];
    for (const block of d.output) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'message' && Array.isArray(b.content)) {
        for (const cb of b.content) {
          if (cb && typeof cb === 'object') {
            const c = cb as Record<string, unknown>;
            if (c.type === 'output_text' || c.type === 'text') {
              const t = String(c.text || '').trim();
              if (t) allTexts.push(t);
            }
          }
        }
      } else if (b.type === 'output_text' || b.type === 'text') {
        const t = String(b.text || '').trim();
        if (t) allTexts.push(t);
      }
    }

    if (DEBUG) console.log(`[supervisor] found ${allTexts.length} text block(s) in output`);

    if (allTexts.length) {
      for (const text of [...allTexts].reverse()) {
        if (text.includes('{') && (text.includes('narrative') || text.includes('key_insights') || text.includes('insight'))) {
          return parseJsonBlock(text);
        }
      }

      const combined = allTexts.join(' ');
      if (combined.includes('{')) {
        const result = parseJsonBlock(combined);
        if (typeof result.narrative === 'string' || result.key_insights || result.insight) {
          return result;
        }
      }

      return parseJsonBlock(allTexts[allTexts.length - 1]);
    }

    return { narrative: 'Supervisor is still querying Genie — please retry in a moment.' };
  }

  if (Array.isArray(d.choices)) {
    const c = d.choices[0] as Record<string, unknown>;
    const msg = (c?.message as Record<string, unknown>) || {};
    const content = msg.content;
    if (typeof content === 'string') return parseJsonBlock(content);
    if (content && typeof content === 'object') return content as Record<string, unknown>;
  }

  if (typeof d.output === 'string') return parseJsonBlock(d.output);

  if ('narrative' in d || 'key_insights' in d || 'observations' in d || 'insight' in d) return d;

  return d;
}

function extractSseDataPayloads(raw: string): string[] {
  const payloads: string[] = [];
  const re = /^data:\s*(.*)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    payloads.push(match[1].trim());
  }
  return payloads;
}

function looksLikeSseStream(raw: string): boolean {
  return raw.includes('data:') && (
    raw.includes('response.output_text.delta') ||
    raw.includes('response.completed') ||
    raw.includes('response.output_item.done')
  );
}

/** Reassemble Databricks Open Responses SSE chunks into plain text or a JSON response body. */
function parseSupervisorSseStream(raw: string): { text: string; rawForContinue: string } {
  if (!looksLikeSseStream(raw)) {
    return { text: raw, rawForContinue: raw };
  }

  const deltas: string[] = [];
  const outputTexts: string[] = [];
  let completedResponse: Record<string, unknown> | null = null;
  const continueLines: string[] = [];

  for (const dataLine of extractSseDataPayloads(raw)) {
    if (!dataLine || dataLine === '[DONE]') continue;

    if (dataLine.includes('task_continue_request')) {
      continueLines.push(`data: ${dataLine}`);
    }

    try {
      const event = JSON.parse(dataLine) as Record<string, unknown>;
      const type = String(event.type || '');

      if (type === 'response.output_text.delta') {
        deltas.push(String(event.delta || ''));
        continue;
      }

      if (type === 'response.completed' && event.response && typeof event.response === 'object') {
        completedResponse = event.response as Record<string, unknown>;
        continue;
      }

      if (type === 'response.output_item.done') {
        const item = event.item as Record<string, unknown> | undefined;
        if (Array.isArray(item?.content)) {
          for (const block of item.content) {
            if (!block || typeof block !== 'object') continue;
            const chunk = block as Record<string, unknown>;
            if (chunk.type === 'output_text' || chunk.type === 'text') {
              const t = String(chunk.text || '').trim();
              if (t) outputTexts.push(t);
            }
          }
        } else if (typeof item?.text === 'string' && item.text.trim()) {
          outputTexts.push(item.text.trim());
        }
      }
    } catch {
      // skip malformed SSE JSON lines
    }
  }

  const rawForContinue = continueLines.length ? continueLines.join('\n\n') : raw;

  if (completedResponse) {
    return { text: JSON.stringify(completedResponse), rawForContinue };
  }

  const assembled = (outputTexts.join('') || deltas.join('')).trim();
  if (assembled) {
    return { text: assembled, rawForContinue };
  }

  return { text: raw, rawForContinue };
}

async function readResponseBody(resp: Response): Promise<string> {
  if (!resp.body) return resp.text();

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    chunks.push(chunk);
    if (DEBUG) console.log(`[supervisor] chunk: ${chunk.slice(0, 150)}`);
  }

  return chunks.join('');
}

async function postOnce(input: SupervisorInput[]): Promise<string> {
  const h = host();
  const url = `https://${h}/serving-endpoints/${endpoint()}/invocations`;
  const databricksOptions = supervisorDatabricksOptions();
  console.log(
    `[supervisor] -> ${endpoint()} | stream=true long_task=${Boolean(databricksOptions.long_task)}`,
  );

  const body: Record<string, unknown> = {
    input,
    stream: true,
  };
  if (Object.keys(databricksOptions).length) {
    body.databricks_options = databricksOptions;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  console.log(`[supervisor] <- HTTP ${resp.status}`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supervisor HTTP ${resp.status}: ${text.slice(0, 400)}`);
  }

  return readResponseBody(resp);
}

async function callSupervisor(messages: Message[], metrics?: MetricsPayload | null): Promise<string> {
  if (!supervisorConfigured()) {
    throw new Error('Supervisor not configured — set SUPERVISOR_ENDPOINT_NAME in .env');
  }

  const conversation: SupervisorInput[] = [...messages];
  let raw = '';

  for (let attempt = 0; attempt < MAX_CONTINUATIONS; attempt++) {
    console.log(`[supervisor] attempt ${attempt + 1}/${MAX_CONTINUATIONS}…`);
    const streamRaw = await postOnce(conversation);
    const { text: assembled, rawForContinue } = parseSupervisorSseStream(streamRaw);
    raw = assembled;
    if (DEBUG) console.log(`[supervisor] response ${raw.length} chars: ${raw.slice(0, 300)}`);

    const taskContinue = LONG_TASK ? findTaskContinueCheckpoint(rawForContinue) : null;
    if (taskContinue) {
      console.log(`[supervisor] task_continue checkpoint step=${taskContinue.step ?? '?'} — resuming…`);
      conversation.push({
        type: 'task_continue_request',
        id: taskContinue.id,
        ...(taskContinue.step != null ? { step: taskContinue.step } : {}),
      });
      conversation.push({
        type: 'task_continue_response',
        continue_request_id: taskContinue.id,
      });
      continue;
    }

    const parsed = parseJsonBlock(raw);
    const text = String(parsed.narrative || raw);

    if (isTimeoutResponse(text)) {
      console.log('[supervisor] ⚠ internal time limit — sending Continue…');
      conversation.push({ role: 'assistant', content: text });
      conversation.push({ role: 'user', content: 'Continue' });
      continue;
    }

    if (
      parsed.narrative &&
      Object.keys(parsed).length === 1 &&
      !text.includes('{') &&
      attempt < MAX_CONTINUATIONS - 1 &&
      text.length > 20
    ) {
      console.log('[supervisor] plain text — requesting JSON narrative…');
      conversation.push({ role: 'assistant', content: text });
      conversation.push({
        role: 'user',
        content: 'Continue and return the JSON with a narrative field now.',
      });
      continue;
    }

    if (parsed.narrative || parsed.key_insights || parsed.observations || parsed.insight) {
      return raw;
    }

    return raw;
  }

  throw new Error('Supervisor max continuations reached');
}

function isGarbageNarrative(text: string): boolean {
  const t = text.trim();
  return (
    looksLikeSseStream(t) ||
    t.startsWith('data:') ||
    t.includes('"response.output_text.delta"') ||
    t.includes('"type":"response.output_text.delta"')
  );
}

function extractNarrative(raw: string): string {
  const { text } = parseSupervisorSseStream(raw);
  const parsed = parseJsonBlock(text);

  if (typeof parsed.narrative === 'string' && parsed.narrative.trim()) {
    const narrative = parsed.narrative.trim();
    if (isGarbageNarrative(narrative)) return '';
    return narrative.slice(0, 600);
  }

  if (typeof parsed.insight === 'string' && parsed.insight.trim()) {
    return parsed.insight.trim().slice(0, 600);
  }

  if (Array.isArray(parsed.observations) && parsed.observations.length) {
    return String(parsed.observations[0]).slice(0, 600);
  }

  if (Array.isArray(parsed.key_insights)) {
    const first = parsed.key_insights[0] as Record<string, unknown> | undefined;
    if (first?.text) return String(first.text).slice(0, 600);
  }

  const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
  if (cleaned && !cleaned.startsWith('{') && !isGarbageNarrative(cleaned)) {
    return cleaned.slice(0, 600);
  }
  return '';
}

function narrativeUsesOnlyDashboardPeriods(narrative: string, periods: string[]): boolean {
  if (!periods.length) return true;
  const allowed = new Set(periods.map(p => p.toUpperCase()));
  const mentioned = narrative.match(/\bP\d{1,2}\b/gi) || [];
  return mentioned.every(m => allowed.has(m.toUpperCase()));
}

function metricsInsightFallback(
  entityType: SummaryEntity,
  metrics: MetricsPayload,
): string {
  return metrics.tab_insights?.[entityType] || buildTabInsights(metrics)[entityType] || '';
}

export async function getSupervisorSummary(
  entityType: SummaryEntity,
  filters: Record<string, unknown>,
  metrics?: MetricsPayload | null,
): Promise<{ narrative: string; source: 'supervisor' }> {
  const prompt = buildSupervisorPrompt(entityType, filters, metrics);
  console.log(`[supervisor] summary tab=${entityType} filters=${JSON.stringify(filters).slice(0, 120)}`);
  const raw = await callSupervisor([{ role: 'user', content: prompt }], metrics);
  let narrative = extractNarrative(raw);

  if (
    metrics?.periods?.length &&
    narrative &&
    !narrativeUsesOnlyDashboardPeriods(narrative, metrics.periods)
  ) {
    const fallback = metricsInsightFallback(entityType, metrics);
    if (fallback) {
      console.warn(
        `[supervisor] ${entityType} cited periods outside dashboard (${metrics.periods.join(', ')}) — using metrics insight`,
      );
      narrative = fallback;
    }
  }

  if (!narrative) {
    throw new Error('Supervisor returned empty narrative — retry shortly');
  }

  return { narrative, source: 'supervisor' };
}

/** VR parallel mode — one Supervisor call per tab, all run simultaneously. */
export async function getAllSupervisorSummaries(
  filters: Record<string, unknown>,
  metrics?: MetricsPayload | null,
): Promise<Record<SummaryEntity, string>> {
  const tabs: SummaryEntity[] = ['overview', 'category', 'line', 'dow', 'reason'];
  console.log(`[supervisor] PARALLEL mode — ${tabs.length} tab summaries (long_task=${LONG_TASK})`);

  const entries = await Promise.all(
    tabs.map(async tab => {
      try {
        const { narrative } = await getSupervisorSummary(tab, filters, metrics);
        return [tab, narrative] as const;
      } catch (e) {
        console.warn(`[supervisor] ${tab} failed:`, (e as Error).message);
        return [tab, ''] as const;
      }
    }),
  );

  return Object.fromEntries(entries) as Record<SummaryEntity, string>;
}
