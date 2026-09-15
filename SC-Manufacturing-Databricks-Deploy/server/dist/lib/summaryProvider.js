import { claudeConfigured } from './claudeSummary.js';
import { supervisorConfigured } from './supervisor.js';
/** Resolve AI summary backend. Defaults to Claude when configured; Supervisor is opt-in. */
export function resolveSummaryProvider() {
    const explicit = String(process.env.SUMMARY_PROVIDER || '').toLowerCase();
    if (explicit === 'supervisor') {
        return supervisorConfigured() ? 'supervisor' : 'template';
    }
    if (explicit === 'template')
        return 'template';
    if (explicit === 'claude') {
        return claudeConfigured() ? 'claude' : 'template';
    }
    if (claudeConfigured())
        return 'claude';
    if (supervisorConfigured())
        return 'supervisor';
    return 'template';
}
export function summaryProviderLabel(provider) {
    switch (provider) {
        case 'claude':
            return 'claude-opus';
        case 'supervisor':
            return 'supervisor-agent';
        default:
            return 'template-fallback';
    }
}
export function isFallbackSummarySource(source) {
    return source === 'template' || source === 'template-fallback';
}
export function allowTemplateFallback() {
    return String(process.env.SUMMARY_ALLOW_TEMPLATE_FALLBACK || '').toLowerCase() === 'true';
}
export function describeSummaryProvider() {
    const explicit = String(process.env.SUMMARY_PROVIDER || '').toLowerCase();
    const provider = resolveSummaryProvider();
    let reason = 'Claude is configured and selected.';
    if (explicit === 'template') {
        reason = 'SUMMARY_PROVIDER=template';
    }
    else if (explicit === 'supervisor' && provider !== 'supervisor') {
        reason = 'SUMMARY_PROVIDER=supervisor but SUPERVISOR_ENDPOINT_NAME is not set';
    }
    else if (explicit === 'claude' && provider !== 'claude') {
        reason = 'SUMMARY_PROVIDER=claude but DATABRICKS_HOST + DATABRICKS_PAT_TOKEN + CLAUDE_SERVING_ENDPOINT are required';
    }
    else if (provider === 'template') {
        reason = 'No Claude or Supervisor credentials found in .env';
    }
    else if (provider === 'supervisor') {
        reason = 'Supervisor selected (Claude not configured)';
    }
    return {
        provider,
        label: summaryProviderLabel(provider),
        claude_configured: claudeConfigured(),
        supervisor_configured: supervisorConfigured(),
        allow_template_fallback: allowTemplateFallback(),
        reason,
    };
}
