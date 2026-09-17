"""Resolve AI summary backend — Claude default, Supervisor opt-in."""
from __future__ import annotations

import os
from typing import Literal, TypedDict

from py_server.lib.claude_summary import claude_configured
from py_server.lib.supervisor import supervisor_configured

SummaryProvider = Literal['claude', 'supervisor', 'template']


def resolve_summary_provider() -> SummaryProvider:
    explicit = (os.getenv('SUMMARY_PROVIDER') or '').lower()

    if explicit == 'supervisor':
        return 'supervisor' if supervisor_configured() else 'template'
    if explicit == 'template':
        return 'template'
    if explicit == 'claude':
        return 'claude' if claude_configured() else 'template'

    if claude_configured():
        return 'claude'
    if supervisor_configured():
        return 'supervisor'
    return 'template'


def summary_provider_label(provider: SummaryProvider) -> str:
    if provider == 'claude':
        return 'claude-opus'
    if provider == 'supervisor':
        return 'supervisor-agent'
    return 'template-fallback'


def is_fallback_summary_source(source: str | None) -> bool:
    return source in ('template', 'template-fallback')


def allow_template_fallback() -> bool:
    return (os.getenv('SUMMARY_ALLOW_TEMPLATE_FALLBACK') or '').lower() == 'true'


class ProviderDescription(TypedDict):
    provider: SummaryProvider
    label: str
    claude_configured: bool
    supervisor_configured: bool
    allow_template_fallback: bool
    reason: str


def describe_summary_provider() -> ProviderDescription:
    explicit = (os.getenv('SUMMARY_PROVIDER') or '').lower()
    provider = resolve_summary_provider()
    reason = 'Claude is configured and selected.'

    if explicit == 'template':
        reason = 'SUMMARY_PROVIDER=template'
    elif explicit == 'supervisor' and provider != 'supervisor':
        reason = 'SUMMARY_PROVIDER=supervisor but SUPERVISOR_ENDPOINT_NAME is not set'
    elif explicit == 'claude' and provider != 'claude':
        reason = (
            'SUMMARY_PROVIDER=claude but DATABRICKS_HOST + DATABRICKS_PAT_TOKEN + '
            'CLAUDE_SERVING_ENDPOINT are required'
        )
    elif provider == 'template':
        reason = 'No Claude or Supervisor credentials found in .env'
    elif provider == 'supervisor':
        reason = 'Supervisor selected (Claude not configured)'

    return {
        'provider': provider,
        'label': summary_provider_label(provider),
        'claude_configured': claude_configured(),
        'supervisor_configured': supervisor_configured(),
        'allow_template_fallback': allow_template_fallback(),
        'reason': reason,
    }
