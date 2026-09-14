import { claudeConfigured } from './claudeSummary.js';
import { supervisorConfigured } from './supervisor.js';

export type SummaryProvider = 'claude' | 'supervisor' | 'template';

/** Resolve AI summary backend. Defaults to Claude when configured; Supervisor is opt-in. */
export function resolveSummaryProvider(): SummaryProvider {
  const explicit = String(process.env.SUMMARY_PROVIDER || '').toLowerCase();

  if (explicit === 'supervisor') {
    return supervisorConfigured() ? 'supervisor' : 'template';
  }
  if (explicit === 'template') return 'template';
  if (explicit === 'claude') {
    return claudeConfigured() ? 'claude' : 'template';
  }

  if (claudeConfigured()) return 'claude';
  if (supervisorConfigured()) return 'supervisor';
  return 'template';
}

export function summaryProviderLabel(provider: SummaryProvider): string {
  switch (provider) {
    case 'claude':
      return 'claude-opus';
    case 'supervisor':
      return 'supervisor-agent';
    default:
      return 'template-fallback';
  }
}
