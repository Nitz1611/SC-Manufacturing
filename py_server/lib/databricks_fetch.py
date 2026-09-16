"""Shared HTTPS fetch for Databricks APIs — mirrors server/lib/databricksFetch.ts."""
from __future__ import annotations

import os
import re
from typing import Any

import requests

_proxy_logged = False


def _env(key: str) -> str:
    return (os.environ.get(key) or "").strip()


def databricks_host() -> str:
    host = _env("DATABRICKS_HOST") or _env("DATABRICKS_SERVER_HOSTNAME")
    host = re.sub(r"^https?://", "", host)
    return host.rstrip("/")


def databricks_token() -> str:
    return _env("DATABRICKS_PAT_TOKEN") or _env("DATABRICKS_TOKEN")


def _proxy_url() -> str | None:
    return (
        os.environ.get("HTTPS_PROXY")
        or os.environ.get("https_proxy")
        or os.environ.get("HTTP_PROXY")
        or os.environ.get("http_proxy")
        or None
    )


def _error_code(err: BaseException) -> str | None:
    cause = getattr(err, "__cause__", None)
    if cause is not None:
        code = getattr(cause, "errno", None)
        if code is not None:
            return str(code)
        if hasattr(cause, "args") and cause.args:
            return str(cause.args[0]) if cause.args else None
    if hasattr(err, "errno") and err.errno is not None:
        return str(err.errno)
    return None


def _error_cause_message(err: BaseException) -> str:
    cause = getattr(err, "__cause__", None)
    if isinstance(cause, BaseException):
        return str(cause)
    return ""


def format_fetch_error(err: BaseException, url: str) -> str:
    message = str(err)
    code = _error_code(err)
    cause = _error_cause_message(err)
    host = databricks_host() or "(DATABRICKS_HOST not set)"
    parts = [f"Cannot reach {url}"]
    if code:
        parts.append(f"code={code}")
    if cause and cause != message:
        parts.append(cause)

    hints: list[str] = []
    if code == "ENOTFOUND" or "getaddrinfo" in message or "Name or service not known" in message:
        hints.append(
            f"check DATABRICKS_HOST ({host}) — use your workspace hostname like "
            "adb-1234567890123456.7.azuredatabricks.net"
        )
    if code in ("ECONNREFUSED", "ETIMEDOUT", "ECONNRESET"):
        hints.append("connect to corporate VPN if required")
        hints.append("set HTTPS_PROXY in .env if your network uses a proxy")
    if code in ("UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN"):
        hints.append("set REQUESTS_CA_BUNDLE or SSL_CERT_FILE to your corporate root CA bundle")
    if not _proxy_url() and (code == "ETIMEDOUT" or message == "fetch failed"):
        hints.append("try HTTPS_PROXY=http://your-proxy:8080 in .env")

    if hints:
        parts.append(f"Hints: {'; '.join(hints)}")
    return " — ".join(parts)


def _fetch_with_optional_proxy(
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    json_body: Any = None,
    timeout: float = 120.0,
    stream: bool = False,
) -> requests.Response:
    global _proxy_logged
    proxy = _proxy_url()
    proxies = None
    if proxy:
        if not _proxy_logged:
            print(f"[databricks] using HTTPS proxy {proxy}")
            _proxy_logged = True
        proxies = {"http": proxy, "https": proxy}

    return requests.request(
        method=method,
        url=url,
        headers=headers,
        json=json_body,
        proxies=proxies,
        timeout=timeout,
        stream=stream,
    )


def databricks_fetch(
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    json_body: Any = None,
    timeout: float = 120.0,
    stream: bool = False,
) -> requests.Response:
    try:
        return _fetch_with_optional_proxy(
            url,
            method=method,
            headers=headers,
            json_body=json_body,
            timeout=timeout,
            stream=stream,
        )
    except requests.RequestException as err:
        raise RuntimeError(format_fetch_error(err, url)) from err


def test_databricks_reachability() -> dict:
    host = databricks_host()
    proxy = _proxy_url()
    if not host:
        return {
            "ok": False,
            "host": "",
            "proxy": proxy,
            "error": "DATABRICKS_HOST or DATABRICKS_SERVER_HOSTNAME is not set",
        }

    token = databricks_token()
    url = f"https://{host}/api/2.0/clusters/list?page_size=1"
    try:
        resp = databricks_fetch(
            url,
            headers={"Authorization": f"Bearer {token}"} if token else {},
        )
        return {"ok": True, "host": host, "status": resp.status_code, "proxy": proxy}
    except RuntimeError as err:
        return {
            "ok": False,
            "host": host,
            "proxy": proxy,
            "error": str(err),
            "error_code": _error_code(err.__cause__) if err.__cause__ else None,
        }
