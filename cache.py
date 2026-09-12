"""
cache.py — persistent file-based cache

Survives server restarts. Stored in cache.json next to app.py.
TTL controlled by INSIGHTS_REFRESH_INTERVAL_HOURS in .env
"""

import os
import json
import time
from dotenv import load_dotenv

load_dotenv()

CACHE_FILE = os.path.join(os.path.dirname(__file__), "cache.json")
CACHE_TTL  = int(os.getenv("INSIGHTS_REFRESH_INTERVAL_HOURS", 24)) * 3600


def _load_file() -> dict:
    try:
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, "r") as f:
                return json.load(f)
    except Exception as e:
        print(f"[cache] Could not read cache file: {e}")
    return {}


def _save_file(store: dict):
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(store, f)
    except Exception as e:
        print(f"[cache] Could not write cache file: {e}")


def get(key: str) -> dict | None:
    """Return cached data if exists and not expired. None otherwise."""
    store = _load_file()
    entry = store.get(key)
    if not entry:
        return None
    age = time.time() - entry.get("ts", 0)
    if age > CACHE_TTL:
        print(f"[cache] EXPIRED — {int(age/3600)}h old (TTL={CACHE_TTL//3600}h)")
        return None
    age_min = int(age / 60)
    print(f"[cache] HIT — {age_min}m old, TTL={CACHE_TTL//3600}h, expires in {int((CACHE_TTL-age)/60)}m")
    return entry.get("data")


def set(key: str, data: dict):
    """Save data to cache with current timestamp."""
    store = _load_file()
    store[key] = {"data": data, "ts": time.time()}
    _save_file(store)
    print(f"[cache] SAVED — key={key[:40]}, TTL={CACHE_TTL//3600}h")


def clear():
    """Clear all cached entries."""
    if os.path.exists(CACHE_FILE):
        os.remove(CACHE_FILE)
    print("[cache] Cleared")


def info() -> dict:
    """Return cache metadata for /api/status."""
    store = _load_file()
    entries = []
    for key, entry in store.items():
        age = time.time() - entry.get("ts", 0)
        entries.append({
            "key":        key,
            "age_min":    int(age / 60),
            "expired":    age > CACHE_TTL,
            "expires_in": max(0, int((CACHE_TTL - age) / 60)),
        })
    return {
        "file":        CACHE_FILE,
        "ttl_hours":   CACHE_TTL // 3600,
        "entry_count": len(entries),
        "entries":     entries,
    }
