"""
Claude Opus via Databricks Model Serving — replaces Supervisor Agent for AI narratives.
"""
import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()


def host() -> str:
    return (
        os.getenv("DATABRICKS_HOST")
        or os.getenv("DATABRICKS_SERVER_HOSTNAME")
        or ""
    ).replace("https://", "").replace("http://", "").rstrip("/")


def token() -> str:
    return os.getenv("DATABRICKS_PAT_TOKEN") or os.getenv("DATABRICKS_TOKEN") or ""


def endpoint() -> str:
    return (
        os.getenv("CLAUDE_SERVING_ENDPOINT")
        or os.getenv("DATABRICKS_CLAUDE_ENDPOINT")
        or "databricks-claude-opus-4-6"
    )


def api_mode() -> str:
    mode = (os.getenv("CLAUDE_API_MODE") or "auto").lower()
    if mode in ("anthropic", "messages"):
        return "anthropic"
    if mode in ("invocations", "chat"):
        return "invocations"
    return "auto"


def claude_configured() -> bool:
    return bool(host() and token() and endpoint())


def status() -> dict:
    return {
        "configured": claude_configured(),
        "host": host() or "NOT SET",
        "endpoint": endpoint(),
        "api_mode": api_mode(),
    }


def _extract_text(data: dict) -> str:
    choices = data.get("choices") or []
    if choices:
        msg = (choices[0].get("message") or {}).get("content")
        if msg:
            return str(msg).strip()

    if isinstance(data.get("output"), str):
        return data["output"].strip()

    output = data.get("output")
    if isinstance(output, list):
        for block in output:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "message":
                for cb in block.get("content") or []:
                    if isinstance(cb, dict):
                        text = str(cb.get("text") or "").strip()
                        if text:
                            return text

    predictions = data.get("predictions") or []
    if predictions:
        p0 = predictions[0]
        if isinstance(p0, str):
            return p0.strip()
        if isinstance(p0, dict):
            if isinstance(p0.get("content"), str):
                return p0["content"].strip()

    content = data.get("content")
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("text"):
                parts.append(str(block["text"]))
        if parts:
            return "".join(parts).strip()

    return ""


def _invoke_invocations(messages: list) -> str:
    url = f"https://{host()}/serving-endpoints/{endpoint()}/invocations"
    body = {
        "messages": messages,
        "max_tokens": int(os.getenv("CLAUDE_MAX_TOKENS", "800")),
        "temperature": float(os.getenv("CLAUDE_TEMPERATURE", "0.2")),
    }
    print(f"[claude] invocations → {endpoint()} ({len(messages)} messages)…")
    resp = requests.post(
        url,
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
        json=body,
        timeout=180,
    )
    if not resp.ok:
        raise RuntimeError(f"Claude invocations HTTP {resp.status_code}: {resp.text[:400]}")
    text = _extract_text(resp.json())
    if not text:
        raise RuntimeError("Claude invocations returned empty content")
    return text


def _invoke_anthropic(messages: list) -> str:
    url = f"https://{host()}/serving-endpoints/anthropic/v1/messages"
    system = next((m["content"] for m in messages if m.get("role") == "system"), None)
    chat = [{"role": m["role"], "content": m["content"]} for m in messages if m.get("role") != "system"]
    if not chat:
        chat = [messages[-1]]

    body = {
        "model": endpoint(),
        "max_tokens": int(os.getenv("CLAUDE_MAX_TOKENS", "800")),
        "temperature": float(os.getenv("CLAUDE_TEMPERATURE", "0.2")),
        "messages": chat,
    }
    if system:
        body["system"] = system

    print(f"[claude] anthropic/messages → {endpoint()}…")
    resp = requests.post(
        url,
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
        json=body,
        timeout=180,
    )
    if not resp.ok:
        raise RuntimeError(f"Claude anthropic HTTP {resp.status_code}: {resp.text[:400]}")
    text = _extract_text(resp.json())
    if not text:
        raise RuntimeError("Claude anthropic returned empty content")
    return text


def invoke_claude(messages: list) -> str:
    mode = api_mode()
    if mode == "anthropic":
        return _invoke_anthropic(messages)
    if mode == "invocations":
        return _invoke_invocations(messages)
    try:
        return _invoke_invocations(messages)
    except Exception as first:
        print(f"[claude] invocations failed ({str(first)[:120]}) — trying anthropic/messages")
        return _invoke_anthropic(messages)
