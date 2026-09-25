"""
Databricks Supervisor Agent — background job + Genie for tab summaries.
Chart data from SQL cache; AI tab summaries via Supervisor → Genie (MAS endpoint).
"""
from __future__ import annotations

import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from py_server.lib.databricks_fetch import databricks_fetch, databricks_host, databricks_token
from py_server.lib.metrics_transform import build_tab_insights
from py_server.lib.summary_prompts import SummaryEntity, build_supervisor_prompt

Message = dict[str, str]
SupervisorInput = Message | dict[str, Any]

DEBUG = (os.getenv('SUPERVISOR_DEBUG') or 'false').lower() == 'true'
MAX_CONTINUATIONS = max(1, int(os.getenv('SUPERVISOR_MAX_CONTINUATIONS') or 12))
LONG_TASK = (os.getenv('SUPERVISOR_LONG_TASK') or 'true').lower() != 'false'


def supervisor_configured() -> bool:
    return bool(databricks_host() and databricks_token() and _endpoint())


def _endpoint() -> str:
    return os.getenv('SUPERVISOR_ENDPOINT_NAME') or ''


def _supervisor_databricks_options() -> dict[str, Any]:
    opts: dict[str, Any] = {}
    if LONG_TASK:
        opts['long_task'] = True
    return opts


def _is_timeout_response(text: str) -> bool:
    lower = text.lower()
    return (
        ('time out' in lower or 'time limit' in lower or 'timed out' in lower)
        and ('continue' in lower or 'would you like' in lower or 'shall i' in lower)
    )


def _find_task_continue_checkpoint(raw: str) -> dict[str, Any] | None:
    id_match = re.search(
        r'"type"\s*:\s*"task_continue_request"[\s\S]*?"id"\s*:\s*"(continue_[^"]+)"',
        raw,
    )
    if not id_match:
        return None
    step_match = re.search(
        r'"type"\s*:\s*"task_continue_request"[\s\S]*?"step"\s*:\s*(\d+)',
        raw,
    )
    return {
        'id': id_match.group(1),
        'step': int(step_match.group(1)) if step_match else None,
    }


def _unwrap_response(d: dict[str, Any]) -> dict[str, Any]:
    output = d.get('output')
    if isinstance(output, list):
        all_texts: list[str] = []
        for block in output:
            if not isinstance(block, dict):
                continue
            if block.get('type') == 'message' and isinstance(block.get('content'), list):
                for cb in block['content']:
                    if isinstance(cb, dict) and cb.get('type') in ('output_text', 'text'):
                        t = str(cb.get('text') or '').strip()
                        if t:
                            all_texts.append(t)
            elif block.get('type') in ('output_text', 'text'):
                t = str(block.get('text') or '').strip()
                if t:
                    all_texts.append(t)

        if DEBUG:
            print(f'[supervisor] found {len(all_texts)} text block(s) in output', flush=True)

        if all_texts:
            for text in reversed(all_texts):
                if '{' in text and any(k in text for k in ('narrative', 'key_insights', 'insight')):
                    return _parse_json_block(text)

            combined = ' '.join(all_texts)
            if '{' in combined:
                result = _parse_json_block(combined)
                if isinstance(result.get('narrative'), str) or result.get('key_insights') or result.get('insight'):
                    return result

            return _parse_json_block(all_texts[-1])

        return {'narrative': 'Supervisor is still querying Genie — please retry in a moment.'}

    choices = d.get('choices')
    if isinstance(choices, list) and choices:
        c = choices[0] if isinstance(choices[0], dict) else {}
        msg = c.get('message') or {}
        content = msg.get('content')
        if isinstance(content, str):
            return _parse_json_block(content)
        if isinstance(content, dict):
            return content

    if isinstance(d.get('output'), str):
        return _parse_json_block(d['output'])

    if any(k in d for k in ('narrative', 'key_insights', 'observations', 'insight')):
        return d

    return d


def _parse_json_block(raw: str) -> dict[str, Any]:
    text = raw.strip()
    try:
        d = json.loads(text)
        if isinstance(d, dict):
            return _unwrap_response(d)
    except json.JSONDecodeError:
        pass

    cleaned = re.sub(r'```json\s*|```\s*', '', text).strip()
    best: dict[str, Any] | None = None
    best_len = 0
    depth = 0
    start: int | None = None

    for i, ch in enumerate(cleaned):
        if ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start is not None:
                candidate = cleaned[start:i + 1]
                if len(candidate) > best_len:
                    try:
                        d = json.loads(candidate)
                        if isinstance(d, dict) and d:
                            best = d
                            best_len = len(candidate)
                    except json.JSONDecodeError:
                        pass

    if best:
        return _unwrap_response(best)
    if _looks_like_sse_stream(cleaned):
        return {}
    return {'narrative': cleaned[:500]}


def _extract_sse_data_payloads(raw: str) -> list[str]:
    return [m.group(1).strip() for m in re.finditer(r'^data:\s*(.*)$', raw, re.MULTILINE)]


def _looks_like_sse_stream(raw: str) -> bool:
    return 'data:' in raw and any(
        marker in raw
        for marker in (
            'response.output_text.delta',
            'response.completed',
            'response.output_item.done',
        )
    )


def _parse_supervisor_sse_stream(raw: str) -> tuple[str, str]:
    if not _looks_like_sse_stream(raw):
        return raw, raw

    deltas: list[str] = []
    output_texts: list[str] = []
    completed_response: dict[str, Any] | None = None
    continue_lines: list[str] = []

    for data_line in _extract_sse_data_payloads(raw):
        if not data_line or data_line == '[DONE]':
            continue

        if 'task_continue_request' in data_line:
            continue_lines.append(f'data: {data_line}')

        try:
            event = json.loads(data_line)
        except json.JSONDecodeError:
            continue

        etype = str(event.get('type') or '')
        if etype == 'response.output_text.delta':
            deltas.append(str(event.get('delta') or ''))
            continue

        if etype == 'response.completed' and isinstance(event.get('response'), dict):
            completed_response = event['response']
            continue

        if etype == 'response.output_item.done':
            item = event.get('item')
            if isinstance(item, dict):
                if isinstance(item.get('content'), list):
                    for block in item['content']:
                        if isinstance(block, dict) and block.get('type') in ('output_text', 'text'):
                            t = str(block.get('text') or '').strip()
                            if t:
                                output_texts.append(t)
                elif isinstance(item.get('text'), str) and item['text'].strip():
                    output_texts.append(item['text'].strip())

    raw_for_continue = '\n\n'.join(continue_lines) if continue_lines else raw

    if completed_response:
        return json.dumps(completed_response), raw_for_continue

    assembled = (''.join(output_texts) or ''.join(deltas)).strip()
    if assembled:
        return assembled, raw_for_continue

    return raw, raw_for_continue


def _read_response_body(resp: Any) -> str:
    chunks: list[str] = []
    for chunk in resp.iter_content(decode_unicode=True):
        if chunk:
            if DEBUG:
                print(f'[supervisor] chunk: {str(chunk)[:150]}', flush=True)
            chunks.append(chunk)
    return ''.join(chunks)


def _post_once(conversation: list[SupervisorInput]) -> str:
    h = databricks_host()
    url = f'https://{h}/serving-endpoints/{_endpoint()}/invocations'
    databricks_options = _supervisor_databricks_options()
    print(
        f'[supervisor] -> {_endpoint()} | stream=true long_task={bool(databricks_options.get("long_task"))}',
        flush=True,
    )

    body: dict[str, Any] = {'input': conversation, 'stream': True}
    if databricks_options:
        body['databricks_options'] = databricks_options

    resp = databricks_fetch(
        url,
        method='POST',
        headers={
            'Authorization': f'Bearer {databricks_token()}',
            'Content-Type': 'application/json',
        },
        json_body=body,
        stream=True,
    )

    print(f'[supervisor] <- HTTP {resp.status_code}', flush=True)
    if resp.status_code >= 400:
        text = resp.text[:400]
        raise RuntimeError(f'Supervisor HTTP {resp.status_code}: {text}')

    return _read_response_body(resp)


def _call_supervisor(messages: list[Message], metrics: dict[str, Any] | None = None) -> str:
    if not supervisor_configured():
        raise RuntimeError('Supervisor not configured — set SUPERVISOR_ENDPOINT_NAME in .env')

    conversation: list[SupervisorInput] = list(messages)
    raw = ''

    for attempt in range(MAX_CONTINUATIONS):
        print(f'[supervisor] attempt {attempt + 1}/{MAX_CONTINUATIONS}…', flush=True)
        stream_raw = _post_once(conversation)
        assembled, raw_for_continue = _parse_supervisor_sse_stream(stream_raw)
        raw = assembled
        if DEBUG:
            print(f'[supervisor] response {len(raw)} chars: {raw[:300]}', flush=True)

        task_continue = _find_task_continue_checkpoint(raw_for_continue) if LONG_TASK else None
        if task_continue:
            print(
                f'[supervisor] task_continue checkpoint step={task_continue.get("step", "?")} — resuming…',
                flush=True,
            )
            req: dict[str, Any] = {'type': 'task_continue_request', 'id': task_continue['id']}
            if task_continue.get('step') is not None:
                req['step'] = task_continue['step']
            conversation.append(req)
            conversation.append({
                'type': 'task_continue_response',
                'continue_request_id': task_continue['id'],
            })
            continue

        parsed = _parse_json_block(raw)
        text = str(parsed.get('narrative') or raw)

        if _is_timeout_response(text):
            print('[supervisor] ⚠ internal time limit — sending Continue…', flush=True)
            conversation.append({'role': 'assistant', 'content': text})
            conversation.append({'role': 'user', 'content': 'Continue'})
            continue

        if (
            parsed.get('narrative')
            and len(parsed) == 1
            and '{' not in text
            and attempt < MAX_CONTINUATIONS - 1
            and len(text) > 20
        ):
            print('[supervisor] plain text — requesting JSON narrative…', flush=True)
            conversation.append({'role': 'assistant', 'content': text})
            conversation.append({
                'role': 'user',
                'content': 'Continue and return the JSON with a narrative field now.',
            })
            continue

        if any(k in parsed for k in ('narrative', 'key_insights', 'observations', 'insight')):
            return raw

        return raw

    raise RuntimeError('Supervisor max continuations reached')


def _is_garbage_narrative(text: str) -> bool:
    t = text.strip()
    return (
        _looks_like_sse_stream(t)
        or t.startswith('data:')
        or 'response.output_text.delta' in t
        or '"type":"response.output_text.delta"' in t
    )


def _extract_narrative(raw: str) -> str:
    text, _ = _parse_supervisor_sse_stream(raw)
    parsed = _parse_json_block(text)

    narrative = parsed.get('narrative')
    if isinstance(narrative, str) and narrative.strip():
        n = narrative.strip()
        if _is_garbage_narrative(n):
            return ''
        return n[:600]

    insight = parsed.get('insight')
    if isinstance(insight, str) and insight.strip():
        return insight.strip()[:600]

    observations = parsed.get('observations')
    if isinstance(observations, list) and observations:
        return str(observations[0])[:600]

    key_insights = parsed.get('key_insights')
    if isinstance(key_insights, list) and key_insights:
        first = key_insights[0]
        if isinstance(first, dict) and first.get('text'):
            return str(first['text'])[:600]

    cleaned = re.sub(r'```json\s*|```\s*', '', text).strip()
    if cleaned and not cleaned.startswith('{') and not _is_garbage_narrative(cleaned):
        return cleaned[:600]
    return ''


def _narrative_uses_only_dashboard_periods(narrative: str, periods: list[str]) -> bool:
    if not periods:
        return True
    allowed = {p.upper() for p in periods}
    mentioned = re.findall(r'\bP\d{1,2}\b', narrative, re.IGNORECASE)
    return all(m.upper() in allowed for m in mentioned)


def _metrics_insight_fallback(entity_type: SummaryEntity, metrics: dict[str, Any]) -> str:
    tab_insights = metrics.get('tab_insights') or {}
    if tab_insights.get(entity_type):
        return tab_insights[entity_type]
    return build_tab_insights(metrics).get(entity_type, '')


def get_supervisor_summary(
    entity_type: SummaryEntity,
    filters: dict[str, Any],
    metrics: dict[str, Any] | None = None,
) -> dict[str, str]:
    prompt = build_supervisor_prompt(entity_type, filters, metrics)
    print(
        f'[supervisor] summary tab={entity_type} filters={json.dumps(filters)[:120]}',
        flush=True,
    )
    raw = _call_supervisor([{'role': 'user', 'content': prompt}], metrics)
    narrative = _extract_narrative(raw)

    if metrics and metrics.get('periods') and narrative:
        if not _narrative_uses_only_dashboard_periods(narrative, metrics['periods']):
            fallback = _metrics_insight_fallback(entity_type, metrics)
            if fallback:
                print(
                    f'[supervisor] {entity_type} cited periods outside dashboard '
                    f'({", ".join(metrics["periods"])}) — using metrics insight',
                    flush=True,
                )
                narrative = fallback

    if not narrative:
        raise RuntimeError('Supervisor returned empty narrative — retry shortly')

    return {'narrative': narrative, 'source': 'supervisor'}


def get_all_supervisor_summaries(
    filters: dict[str, Any],
    metrics: dict[str, Any] | None = None,
) -> dict[SummaryEntity, str]:
    tabs: list[SummaryEntity] = ['overview', 'category', 'line', 'dow', 'reason']
    print(f'[supervisor] PARALLEL mode — {len(tabs)} tab summaries (long_task={LONG_TASK})', flush=True)

    out: dict[SummaryEntity, str] = {}

    def fetch_tab(tab: SummaryEntity) -> tuple[SummaryEntity, str]:
        try:
            result = get_supervisor_summary(tab, filters, metrics)
            return tab, result['narrative']
        except Exception as e:
            print(f'[supervisor] {tab} failed: {e}', flush=True)
            return tab, ''

    with ThreadPoolExecutor(max_workers=len(tabs)) as pool:
        futures = [pool.submit(fetch_tab, tab) for tab in tabs]
        for fut in as_completed(futures):
            tab, narrative = fut.result()
            out[tab] = narrative

    return out
