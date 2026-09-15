"""Disk cache for metrics payloads — mirrors server/lib/cache.ts."""
from __future__ import annotations

import json
import os
import time
from typing import Any

from py_server.lib.config import CACHE_FILE

TTL_HOURS = float(os.environ.get("INSIGHTS_REFRESH_INTERVAL_HOURS") or 24)
TTL_MS = TTL_HOURS * 3600 * 1000


def _read_store() -> dict[str, dict[str, Any]]:
    if not CACHE_FILE.is_file():
        return {}
    return json.loads(CACHE_FILE.read_text(encoding="utf-8"))


def cache_get(key: str) -> dict[str, Any] | None:
    try:
        if not CACHE_FILE.is_file():
            return None
        store = _read_store()
        entry = store.get(key)
        if not entry:
            return None
        if (time.time() * 1000) - entry["ts"] > TTL_MS:
            print(f"[cache] EXPIRED key={key[:40]}")
            return None
        print(f"[cache] HIT key={key[:40]}")
        return entry["data"]
    except Exception as exc:
        print(f"[cache] read failed {exc}")
        return None


def cache_get_any() -> dict[str, Any] | None:
    try:
        if not CACHE_FILE.is_file():
            return None
        store = _read_store()
        for key, entry in store.items():
            if key.startswith("metrics_") and entry.get("data"):
                return entry["data"]
            data = entry.get("data") or {}
            if key.startswith("{") and data.get("kpis"):
                return data
        return None
    except Exception:
        return None


def cache_set(key: str, data: dict[str, Any]) -> None:
    try:
        store: dict[str, dict[str, Any]] = {}
        if CACHE_FILE.is_file():
            store = _read_store()
        store[key] = {"data": data, "ts": int(time.time() * 1000)}
        CACHE_FILE.write_text(json.dumps(store), encoding="utf-8")
        print(f"[cache] SAVED key={key[:40]}")
    except Exception as exc:
        print(f"[cache] write failed {exc}")


def cache_info() -> dict[str, Any]:
    try:
        if not CACHE_FILE.is_file():
            return {"entry_count": 0, "entries": []}
        store = _read_store()
        now = time.time() * 1000
        entries = [
            {
                "key": key,
                "age_min": int((now - entry["ts"]) // 60000),
                "expired": now - entry["ts"] > TTL_MS,
            }
            for key, entry in store.items()
        ]
        return {"entry_count": len(entries), "ttl_hours": TTL_HOURS, "entries": entries}
    except Exception:
        return {"entry_count": 0, "entries": []}


def cache_load_all_metrics() -> list[dict[str, Any]]:
    try:
        if not CACHE_FILE.is_file():
            return []
        store = _read_store()
        now = time.time() * 1000
        return [
            {"key": key, "data": entry["data"], "ts": entry["ts"]}
            for key, entry in store.items()
            if key.startswith("metrics_") and entry.get("data") and now - entry["ts"] <= TTL_MS
        ]
    except Exception:
        return []
