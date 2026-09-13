/**
 * Databricks Supervisor Agent — tab-specific AI summaries (VR architecture pattern).
 * Chart data comes from SQL; narratives come from Supervisor + Genie.
 */
import { buildSupervisorPrompt, type SummaryEntity } from './summaryPrompts.js';

type Message = { role: string; content: string };

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

function isTimeoutResponse(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    (lower.includes('time out') || lower.includes('time limit') || lower.includes('timed out')) &&
    (lower.includes('continue') || lower.includes('would you like') || lower.includes('shall i'))
  );
}

function parseJson(raw: string): Record<string, unknown> {
  const text = raw.trim();
  try {
    const d = JSON.parse(text) as unknown;
    if (d && typeof d === 'object') return unwrap(d as Record<string, unknown>);
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

  if (best) return unwrap(best);
  return { narrative: cleaned.slice(0, 500) };
}

function unwrap(d: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(d.output)) {
    const texts: string[] = [];
    for (const block of d.output) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'message' && Array.isArray(b.content)) {
        for (const cb of b.content) {
          if (cb && typeof cb === 'object') {
            const c = cb as Record<string, unknown>;
            if (c.type === 'output_text' || c.type === 'text') {
              const t = String(c.text || '').trim();
              if (t) texts.push(t);
            }
          }
        }
      } else if (b.type === 'output_text' || b.type === 'text') {
        const t = String(b.text || '').trim();
        if (t) texts.push(t);
      }
    }

    for (const text of [...texts].reverse()) {
      if (text.includes('{') && text.includes('narrative')) return parseJson(text);
    }
    if (texts.length) return parseJson(texts[texts.length - 1]);
    return { narrative: 'Supervisor is still querying Genie — please retry in a moment.' };
  }

  if (Array.isArray(d.choices)) {
    const c = d.choices[0] as Record<string, unknown>;
    const msg = (c?.message as Record<string, unknown>) || {};
    const content = msg.content;
    if (typeof content === 'string') return parseJson(content);
    if (content && typeof content === 'object') return content as Record<string, unknown>;
  }

  if (typeof d.output === 'string') return parseJson(d.output);

  if ('narrative' in d || 'key_insights' in d || 'observations' in d) return d;

  return d;
}

async function postOnce(messages: Message[]): Promise<string> {
  const h = host();
  const url = `https://${h}/serving-endpoints/${endpoint()}/invocations`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: messages }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supervisor HTTP ${resp.status}: ${text.slice(0, 400)}`);
  }
  return resp.text();
}

async function callSupervisor(messages: Message[]): Promise<string> {
  const conversation = [...messages];
  for (let attempt = 0; attempt < 6; attempt++) {
    console.log(`[supervisor] attempt ${attempt + 1}…`);
    const raw = await postOnce(conversation);
    const parsed = parseJson(raw);
    const text = String(parsed.narrative || raw);

    if (isTimeoutResponse(text)) {
      conversation.push({ role: 'assistant', content: text });
      conversation.push({ role: 'user', content: 'Continue' });
      continue;
    }

    if (parsed.narrative && Object.keys(parsed).length === 1 && !text.includes('{')) {
      if (attempt < 5 && text.length > 20) {
        conversation.push({ role: 'assistant', content: text });
        conversation.push({ role: 'user', content: 'Continue and return the JSON with a narrative field now.' });
        continue;
      }
    }

    if (parsed.narrative || parsed.key_insights || parsed.observations) {
      return raw;
    }

    return raw;
  }
  throw new Error('Supervisor max continuations reached');
}

function extractNarrative(raw: string): string {
  const parsed = parseJson(raw);
  if (typeof parsed.narrative === 'string' && parsed.narrative.trim()) {
    return parsed.narrative.trim().slice(0, 600);
  }
  if (Array.isArray(parsed.observations) && parsed.observations.length) {
    return String(parsed.observations[0]).slice(0, 600);
  }
  if (Array.isArray(parsed.key_insights)) {
    const first = parsed.key_insights[0] as Record<string, unknown> | undefined;
    if (first?.text) return String(first.text).slice(0, 600);
  }
  const cleaned = raw.replace(/```json\s*|```\s*/g, '').trim();
  if (cleaned && !cleaned.startsWith('{')) return cleaned.slice(0, 600);
  return '';
}

export async function getSupervisorSummary(
  entityType: SummaryEntity,
  filters: Record<string, unknown>,
): Promise<{ narrative: string; source: 'supervisor' | 'fallback' }> {
  if (!supervisorConfigured()) {
    throw new Error('Supervisor not configured — set SUPERVISOR_ENDPOINT_NAME in .env');
  }

  const prompt = buildSupervisorPrompt(entityType, filters);
  console.log(`[supervisor] summary tab=${entityType} filters=${JSON.stringify(filters).slice(0, 120)}`);
  const raw = await callSupervisor([{ role: 'user', content: prompt }]);
  const narrative = extractNarrative(raw);

  if (!narrative) {
    throw new Error('Supervisor returned empty narrative — retry shortly');
  }

  return { narrative, source: 'supervisor' };
}

/** Load all tab summaries in parallel (used by batch endpoint). */
export async function getAllSupervisorSummaries(
  filters: Record<string, unknown>,
): Promise<Record<SummaryEntity, string>> {
  const tabs: SummaryEntity[] = ['overview', 'category', 'line', 'dow', 'reason'];
  const entries = await Promise.all(
    tabs.map(async tab => {
      try {
        const { narrative } = await getSupervisorSummary(tab, filters);
        return [tab, narrative] as const;
      } catch (e) {
        console.warn(`[supervisor] ${tab} failed:`, (e as Error).message);
        return [tab, ''] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<SummaryEntity, string>;
}
