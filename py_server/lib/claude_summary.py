"""
Claude Opus summaries via Databricks Model Serving.
Default AI path for tab narratives; Supervisor Agent is optional via SUMMARY_PROVIDER=supervisor.
"""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Literal

from py_server.lib.databricks_fetch import databricks_fetch, databricks_host, databricks_token
from py_server.lib.summary_prompts import (
    SummaryEntity,
    build_filter_context,
    build_metrics_grounding_context,
)

ChatMessage = dict[str, str]

PROFESSIONAL_VOICE = """You are a senior manufacturing operations analyst writing an executive briefing for plant leadership.
Focus ONLY on unplanned downtime. Use ONLY numbers from the dashboard metrics block — never invent values.
Write 2–4 polished sentences in professional business English (not a robotic data dump).
Lead with the most important insight (performance vs prior period or benchmark).
Name specific sites, periods, categories, lines, or reasons from the data when relevant.
End with one clear, actionable recommendation for plant managers.
Do not use bullet points, markdown, headers, or JSON in the narrative text.
Vary sentence openings — avoid starting every summary with "Unplanned DT % is"."""

TAB_FOCUS: dict[SummaryEntity, str] = {
    'overview': 'Overall unplanned DT performance: KPI level, peak/low periods, STOPS, and one priority action.',
    'category': 'Top downtime categories by site and period — which category drives the most loss.',
    'line': 'Worst line-level contributors and site/line combinations to address first.',
    'dow': 'Day-of-week and shift patterns — when unplanned DT concentrates across weeks.',
    'reason': 'Top root-cause reasons by hours and period trend — what to fix first.',
}


def claude_endpoint() -> str:
    return (
        os.getenv('CLAUDE_SERVING_ENDPOINT')
        or os.getenv('DATABRICKS_CLAUDE_ENDPOINT')
        or 'databricks-claude-opus-4-6'
    )


def claude_configured() -> bool:
    return bool(databricks_host() and databricks_token() and claude_endpoint())


def _claude_api_mode() -> Literal['invocations', 'anthropic', 'auto']:
    mode = (os.getenv('CLAUDE_API_MODE') or 'auto').lower()
    if mode in ('anthropic', 'messages'):
        return 'anthropic'
    if mode in ('invocations', 'chat'):
        return 'invocations'
    return 'auto'


def is_robotic_template_summary(text: str) -> bool:
    return bool(re.match(r'^Unplanned DT % is \d', str(text or '').strip()))


def claude_status() -> dict[str, Any]:
    return {
        'configured': claude_configured(),
        'host': databricks_host() or 'NOT SET',
        'endpoint': claude_endpoint(),
        'api_mode': _claude_api_mode(),
    }


def _top_entries(obj: dict[str, Any], n: int = 5) -> dict[str, Any]:
    if not obj:
        return {}
    entries = list(obj.items())
    if entries and isinstance(entries[0][1], (int, float)):
        entries.sort(key=lambda x: float(x[1]), reverse=True)
        return dict(entries[:n])
    return dict(entries[:n])


def compact_metrics(metrics: dict[str, Any], entity_type: SummaryEntity | None = None) -> dict[str, Any]:
    base: dict[str, Any] = {
        'kpis': metrics.get('kpis'),
        'periods': metrics.get('periods'),
        'period_trend': metrics.get('period_trend'),
        'top_reasons': (metrics.get('reasons') or [])[:5],
        'top_lines': _top_entries(metrics.get('top_lines') or {}, 5),
        'shift_comparison': (metrics.get('shift_comparison') or [])[:3],
    }

    if not entity_type or entity_type == 'overview':
        base['top_sites'] = _top_entries(metrics.get('site_by_period') or {}, 5)
    if not entity_type or entity_type == 'category':
        base['categories'] = _top_entries(metrics.get('category_by_period') or {}, 5)
    if not entity_type or entity_type == 'line':
        base['lines'] = _top_entries(metrics.get('line_by_period') or {}, 5)
    if not entity_type or entity_type == 'dow':
        dow = metrics.get('dow_by_day_week') or {}
        base['dow_sample'] = dict(list(dow.items())[:3])

    return base


def _extract_text(data: dict[str, Any]) -> str:
    choices = data.get('choices')
    if isinstance(choices, list) and choices:
        msg = choices[0].get('message') or {}
        content = msg.get('content')
        if isinstance(content, str) and content.strip():
            return content.strip()

    if isinstance(data.get('output'), str):
        return data['output'].strip()

    if isinstance(data.get('output'), list):
        for block in data['output']:
            if isinstance(block, dict) and block.get('type') == 'message':
                for cb in block.get('content') or []:
                    if isinstance(cb, dict):
                        t = str(cb.get('text') or '').strip()
                        if t:
                            return t

    predictions = data.get('predictions')
    if isinstance(predictions, list) and predictions:
        p = predictions[0]
        if isinstance(p, str):
            return p.strip()
        if isinstance(p, dict):
            if isinstance(p.get('content'), str):
                return p['content'].strip()
            candidates = p.get('candidates')
            if isinstance(candidates, list) and candidates:
                c = candidates[0]
                if isinstance(c, dict) and isinstance(c.get('text'), str):
                    return c['text'].strip()

    return ''


def _parse_narrative(raw: str) -> str:
    text = raw.strip()
    try:
        d = json.loads(text)
        if isinstance(d.get('narrative'), str):
            return d['narrative'].strip()
    except json.JSONDecodeError:
        pass

    cleaned = re.sub(r'```json\s*|```\s*', '', text).strip()
    try:
        d = json.loads(cleaned)
        if isinstance(d.get('narrative'), str):
            return d['narrative'].strip()
    except json.JSONDecodeError:
        pass
    return cleaned[:600]


def _parse_batch_narratives(raw: str) -> dict[SummaryEntity, str]:
    text = re.sub(r'```json\s*|```\s*', '', raw).strip()
    try:
        d = json.loads(text)
        out: dict[SummaryEntity, str] = {}
        for tab in ('overview', 'category', 'line', 'dow', 'reason'):
            v = d.get(tab)
            if isinstance(v, str) and v.strip():
                out[tab] = v.strip()
            elif isinstance(v, dict) and isinstance(v.get('narrative'), str):
                out[tab] = str(v['narrative']).strip()
        if out:
            return out
    except json.JSONDecodeError:
        pass
    return {}


def _invoke_claude_invocations(messages: list[ChatMessage]) -> str:
    h = databricks_host()
    url = f'https://{h}/serving-endpoints/{claude_endpoint()}/invocations'
    body = {
        'messages': messages,
        'max_tokens': int(os.getenv('CLAUDE_MAX_TOKENS') or 800),
        'temperature': float(os.getenv('CLAUDE_TEMPERATURE') or 0.2),
    }

    print(f'[claude] invocations → {claude_endpoint()} ({len(messages)} messages)…', flush=True)
    started = time.time()

    resp = databricks_fetch(
        url,
        method='POST',
        headers={
            'Authorization': f'Bearer {databricks_token()}',
            'Content-Type': 'application/json',
        },
        json_body=body,
    )

    if resp.status_code >= 400:
        err_text = resp.text[:400]
        raise RuntimeError(f'Claude invocations HTTP {resp.status_code}: {err_text}')

    data = resp.json()
    text = _extract_text(data)
    if not text:
        raise RuntimeError('Claude invocations returned empty content')
    elapsed = int((time.time() - started) * 1000)
    print(f'[claude] ✓ invocations {len(text)} chars in {elapsed}ms', flush=True)
    return text


def _invoke_claude_anthropic(messages: list[ChatMessage]) -> str:
    h = databricks_host()
    url = f'https://{h}/serving-endpoints/anthropic/v1/messages'
    system = next((m['content'] for m in messages if m.get('role') == 'system'), None)
    chat_messages = [
        {'role': m['role'], 'content': m['content']}
        for m in messages
        if m.get('role') != 'system'
    ]

    body: dict[str, Any] = {
        'model': claude_endpoint(),
        'max_tokens': int(os.getenv('CLAUDE_MAX_TOKENS') or 800),
        'temperature': float(os.getenv('CLAUDE_TEMPERATURE') or 0.2),
        'messages': chat_messages or [{'role': 'user', 'content': messages[-1]['content']}],
    }
    if system:
        body['system'] = system

    print(f'[claude] anthropic/messages → {claude_endpoint()}…', flush=True)
    started = time.time()

    resp = databricks_fetch(
        url,
        method='POST',
        headers={
            'Authorization': f'Bearer {databricks_token()}',
            'Content-Type': 'application/json',
        },
        json_body=body,
    )

    if resp.status_code >= 400:
        err_text = resp.text[:400]
        raise RuntimeError(f'Claude anthropic HTTP {resp.status_code}: {err_text}')

    data = resp.json()
    blocks = data.get('content')
    if isinstance(blocks, list):
        text = ''.join(str(b.get('text') or '') for b in blocks if isinstance(b, dict)).strip()
    else:
        text = _extract_text(data)
    if not text:
        raise RuntimeError('Claude anthropic returned empty content')
    elapsed = int((time.time() - started) * 1000)
    print(f'[claude] ✓ anthropic {len(text)} chars in {elapsed}ms', flush=True)
    return text


def invoke_claude(messages: list[ChatMessage]) -> str:
    mode = _claude_api_mode()
    if mode == 'anthropic':
        return _invoke_claude_anthropic(messages)
    if mode == 'invocations':
        return _invoke_claude_invocations(messages)

    try:
        return _invoke_claude_invocations(messages)
    except Exception as first:
        msg = str(first)[:120]
        print(f'[claude] invocations failed ({msg}) — trying anthropic/messages', flush=True)
        return _invoke_claude_anthropic(messages)


def get_claude_tab_summary(
    entity_type: SummaryEntity,
    filters: dict[str, Any],
    metrics: dict[str, Any],
) -> dict[str, str]:
    filter_ctx = build_filter_context(filters)
    grounding = build_metrics_grounding_context(metrics, entity_type)

    user = f"""{PROFESSIONAL_VOICE}

Tab focus: {TAB_FOCUS[entity_type]}
Applied filters: {filter_ctx}

{grounding}

Return JSON only: {{"narrative":"your 2-4 sentence executive summary"}}"""

    raw = invoke_claude([{'role': 'user', 'content': user}])
    narrative = _parse_narrative(raw)
    if not narrative:
        raise RuntimeError('Claude returned empty narrative')
    return {'narrative': narrative, 'source': 'claude'}


def get_claude_batch_summaries(
    filters: dict[str, Any],
    metrics: dict[str, Any],
) -> dict[SummaryEntity, str]:
    filter_ctx = build_filter_context(filters)
    grounding = build_metrics_grounding_context(metrics, 'overview')

    user = f"""{PROFESSIONAL_VOICE}

Applied filters: {filter_ctx}

{grounding}

Additional metrics JSON (categories, lines, reasons, shifts):
{json.dumps(compact_metrics(metrics), indent=2)}

Write a distinct executive summary for each KPI tab below.
Return ONLY valid JSON with these keys (each value is a 2-4 sentence string):
{{
  "overview": "...",
  "category": "...",
  "line": "...",
  "dow": "...",
  "reason": "..."
}}"""

    raw = invoke_claude([{'role': 'user', 'content': user}])
    parsed = _parse_batch_narratives(raw)
    tabs: list[SummaryEntity] = ['overview', 'category', 'line', 'dow', 'reason']
    out: dict[SummaryEntity, str] = {}

    for tab in tabs:
        if parsed.get(tab):
            out[tab] = parsed[tab]
        else:
            single = get_claude_tab_summary(tab, filters, metrics)
            out[tab] = single['narrative']

    return out
