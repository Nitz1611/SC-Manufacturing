"""
Databricks SQL Statement Execution API — Python client for Flask legacy app.
"""
import os
import time
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


def warehouse_id() -> str:
    return os.getenv("DATABRICKS_WAREHOUSE_ID") or ""


def sql_configured() -> bool:
    return bool(host() and token() and warehouse_id())


def _headers() -> dict:
    return {"Authorization": f"Bearer {token()}", "Content-Type": "application/json"}


def _extract_rows(stmt: dict) -> list[dict]:
    result = stmt.get("result") or {}
    manifest = stmt.get("manifest") or {}
    data_array = result.get("data_array")
    if isinstance(data_array, list):
        cols = [c.get("name", "") for c in (manifest.get("schema") or {}).get("columns") or []]
        rows = []
        for row in data_array:
            obj = {}
            for i, col in enumerate(cols):
                if col:
                    obj[col] = row[i] if i < len(row) else None
            rows.append(obj)
        return rows
    if isinstance(result, list):
        return result
    return []


def _poll_statement(statement_id: str) -> dict:
    url = f"https://{host()}/api/2.0/sql/statements/{statement_id}"
    for attempt in range(90):
        resp = requests.get(url, headers={"Authorization": f"Bearer {token()}"}, timeout=60)
        resp.raise_for_status()
        stmt = resp.json()
        state = (stmt.get("status") or {}).get("state")
        if state == "SUCCEEDED":
            return stmt
        if state in ("FAILED", "CANCELED"):
            err = (stmt.get("status") or {}).get("error") or {}
            raise RuntimeError(err.get("message") or f"SQL statement {state}")
        time.sleep(1.5 if state == "PENDING" else 0.8)
    raise RuntimeError("Databricks SQL timed out waiting for results")


def execute_sql(sql: str) -> list[dict]:
    if not sql_configured():
        raise RuntimeError(
            "Databricks SQL not configured — set DATABRICKS_HOST, DATABRICKS_PAT_TOKEN, DATABRICKS_WAREHOUSE_ID"
        )
    url = f"https://{host()}/api/2.0/sql/statements/"
    body = {
        "warehouse_id": warehouse_id(),
        "statement": sql,
        "wait_timeout": "50s",
        "format": "JSON_ARRAY",
    }
    print(f"[databricks] executing SQL ({len(sql)} chars)…")
    resp = requests.post(url, headers=_headers(), json=body, timeout=120)
    if not resp.ok:
        raise RuntimeError(f"Databricks SQL POST failed ({resp.status_code}): {resp.text[:500]}")
    stmt = resp.json()
    state = (stmt.get("status") or {}).get("state")
    if state != "SUCCEEDED":
        stmt = _poll_statement(str(stmt.get("statement_id")))
    rows = _extract_rows(stmt)
    print(f"[databricks] ✓ {len(rows)} row(s)")
    return rows


def rows_to_json(rows: list[dict], limit: int = 25) -> str:
    return json.dumps(rows[:limit], default=str, indent=2)
