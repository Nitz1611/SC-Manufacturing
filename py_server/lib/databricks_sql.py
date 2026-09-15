"""Databricks SQL Statement Execution API — mirrors server/lib/databricksSql.ts."""
from __future__ import annotations

import os
import time
from typing import Any

from py_server.lib.databricks_fetch import databricks_fetch, databricks_host, databricks_token


def sql_configured() -> bool:
    return bool(databricks_host() and databricks_token() and os.environ.get("DATABRICKS_WAREHOUSE_ID"))


def _extract_rows(stmt: dict[str, Any]) -> list[dict[str, Any]]:
    result = stmt.get("result")
    manifest = stmt.get("manifest") or {}
    schema = manifest.get("schema") or {}
    columns = schema.get("columns") or []

    if isinstance(result, dict) and isinstance(result.get("data_array"), list):
        cols = [c.get("name") or "" for c in columns]
        rows: list[dict[str, Any]] = []
        for row in result["data_array"]:
            obj: dict[str, Any] = {}
            for i, col in enumerate(cols):
                if col:
                    obj[col] = row[i]
            rows.append(obj)
        return rows

    if isinstance(result, list):
        return result
    return []


def _poll_statement(statement_id: str) -> dict[str, Any]:
    host = databricks_host()
    token = databricks_token()
    url = f"https://{host}/api/2.0/sql/statements/{statement_id}"

    for _ in range(90):
        resp = databricks_fetch(url, headers={"Authorization": f"Bearer {token}"})
        if not resp.ok:
            text = resp.text[:400]
            raise RuntimeError(f"Databricks poll failed ({resp.status_code}): {text}")
        stmt = resp.json()
        state = (stmt.get("status") or {}).get("state")

        if state == "SUCCEEDED":
            return stmt
        if state in ("FAILED", "CANCELED"):
            err = (stmt.get("status") or {}).get("error") or {}
            raise RuntimeError(err.get("message") or f"SQL statement {state}")

        if _ % 10 == 0:
            print(f"[databricks] polling {statement_id} state={state}…", flush=True)
        time.sleep(1.5 if state == "PENDING" else 0.8)

    raise RuntimeError("Databricks SQL timed out waiting for results")


def execute_statement(sql: str) -> list[dict[str, Any]]:
    if not sql_configured():
        raise RuntimeError(
            "Databricks SQL not configured — set DATABRICKS_HOST, DATABRICKS_PAT_TOKEN, DATABRICKS_WAREHOUSE_ID"
        )

    host = databricks_host()
    url = f"https://{host}/api/2.0/sql/statements/"
    body = {
        "warehouse_id": os.environ.get("DATABRICKS_WAREHOUSE_ID"),
        "statement": sql,
        "wait_timeout": "50s",
        "on_wait_timeout": "CONTINUE",
        "format": "JSON_ARRAY",
    }

    print(f"[databricks] executing SQL ({len(sql)} chars)…")
    resp = databricks_fetch(
        url,
        method="POST",
        headers={
            "Authorization": f"Bearer {databricks_token()}",
            "Content-Type": "application/json",
        },
        json_body=body,
    )

    if not resp.ok:
        text = resp.text[:500]
        raise RuntimeError(f"Databricks SQL POST failed ({resp.status_code}): {text}")

    stmt = resp.json()
    state = (stmt.get("status") or {}).get("state")

    if state != "SUCCEEDED":
        stmt = _poll_statement(str(stmt.get("statement_id")))

    rows = _extract_rows(stmt)
    print(f"[databricks] ✓ {len(rows)} rows")
    return rows


def warmup_warehouse() -> None:
    if not sql_configured():
        return
    execute_statement("SELECT 1 AS ok")
