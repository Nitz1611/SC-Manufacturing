"""Environment loading — mirrors server/lib/env.ts."""
from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

_loaded_env_file: str | None = None


def repo_root() -> str:
    """Repo root (folder containing root package.json with npm workspaces)."""
    dir_path = Path(__file__).resolve().parent
    for _ in range(8):
        pkg_path = dir_path / "package.json"
        if pkg_path.is_file():
            try:
                pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
                if pkg.get("workspaces"):
                    return str(dir_path)
            except (json.JSONDecodeError, OSError):
                pass
        parent = dir_path.parent
        if parent == dir_path:
            break
        dir_path = parent
    return str(Path(__file__).resolve().parent.parent.parent)


def _walk_env_paths(start: str) -> list[str]:
    paths: list[str] = []
    dir_path = Path(start).resolve()
    for _ in range(8):
        paths.append(str(dir_path / ".env"))
        paths.append(str(dir_path / ".env.txt"))
        parent = dir_path.parent
        if parent == dir_path:
            break
        dir_path = parent
    return paths


def env_search_paths() -> list[str]:
    unique: set[str] = set()
    ordered: list[str] = []

    def add(p: str) -> None:
        resolved = str(Path(p).resolve())
        if resolved not in unique:
            unique.add(resolved)
            ordered.append(resolved)

    dotenv_path = os.environ.get("DOTENV_PATH")
    if dotenv_path:
        add(dotenv_path)
    for p in _walk_env_paths(repo_root()):
        add(p)
    for p in _walk_env_paths(os.getcwd()):
        add(p)

    return ordered


def load_env() -> str | None:
    global _loaded_env_file
    for env_path in env_search_paths():
        path = Path(env_path)
        if not path.is_file():
            continue
        try:
            load_dotenv(env_path, override=False)
            _loaded_env_file = env_path
            print(f"[env] loaded {env_path}")
            return env_path
        except Exception as exc:
            print(f"[env] failed to parse {env_path}: {exc}")

    _loaded_env_file = None
    print(f"[env] no .env found. repo_root={repo_root()} cwd={os.getcwd()}")
    return None


def get_loaded_env_file() -> str | None:
    return _loaded_env_file


def sql_env_status() -> dict:
    host = os.environ.get("DATABRICKS_HOST") or os.environ.get("DATABRICKS_SERVER_HOSTNAME") or ""
    token = os.environ.get("DATABRICKS_PAT_TOKEN") or os.environ.get("DATABRICKS_TOKEN") or ""
    warehouse = os.environ.get("DATABRICKS_WAREHOUSE_ID") or ""

    missing: list[str] = []
    if not host.strip():
        missing.append("DATABRICKS_HOST or DATABRICKS_SERVER_HOSTNAME")
    if not token.strip():
        missing.append("DATABRICKS_PAT_TOKEN")
    if not warehouse.strip():
        missing.append("DATABRICKS_WAREHOUSE_ID")

    search = [{"path": p, "exists": Path(p).is_file()} for p in env_search_paths()]

    return {
        "repo_root": repo_root(),
        "cwd": os.getcwd(),
        "env_file": get_loaded_env_file() or next((s["path"] for s in search if s["exists"]), None),
        "env_search": search,
        "missing": missing,
        "host_set": bool(host.strip()),
        "token_set": bool(token.strip()),
        "warehouse_set": bool(warehouse.strip()),
    }
