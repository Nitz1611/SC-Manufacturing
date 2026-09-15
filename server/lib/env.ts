import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

let loadedEnvFile: string | null = null;

/** Repo root (folder containing root package.json with npm workspaces). */
export function repoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { workspaces?: unknown };
        if (pkg.workspaces) return dir;
      } catch {
        // keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

function walkEnvPaths(start: string): string[] {
  const paths: string[] = [];
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    paths.push(path.join(dir, '.env'));
    paths.push(path.join(dir, '.env.txt'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return paths;
}

export function envSearchPaths(): string[] {
  const unique = new Set<string>();
  const ordered: string[] = [];

  const add = (p: string) => {
    const resolved = path.resolve(p);
    if (!unique.has(resolved)) {
      unique.add(resolved);
      ordered.push(resolved);
    }
  };

  if (process.env.DOTENV_PATH) add(process.env.DOTENV_PATH);
  for (const p of walkEnvPaths(repoRoot())) add(p);
  for (const p of walkEnvPaths(process.cwd())) add(p);

  return ordered;
}

export function loadEnv(): string | null {
  for (const envPath of envSearchPaths()) {
    if (!fs.existsSync(envPath)) continue;
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      loadedEnvFile = envPath;
      console.log(`[env] loaded ${envPath}`);
      return envPath;
    }
    console.warn(`[env] failed to parse ${envPath}: ${result.error.message}`);
  }

  loadedEnvFile = null;
  console.warn(`[env] no .env found. repo_root=${repoRoot()} cwd=${process.cwd()}`);
  return null;
}

export function getLoadedEnvFile(): string | null {
  return loadedEnvFile;
}

export function sqlEnvStatus(): {
  repo_root: string;
  cwd: string;
  env_file: string | null;
  env_search: Array<{ path: string; exists: boolean }>;
  missing: string[];
  host_set: boolean;
  token_set: boolean;
  warehouse_set: boolean;
} {
  const host = process.env.DATABRICKS_HOST || process.env.DATABRICKS_SERVER_HOSTNAME || '';
  const token = process.env.DATABRICKS_PAT_TOKEN || process.env.DATABRICKS_TOKEN || '';
  const warehouse = process.env.DATABRICKS_WAREHOUSE_ID || '';

  const missing: string[] = [];
  if (!host.trim()) missing.push('DATABRICKS_HOST or DATABRICKS_SERVER_HOSTNAME');
  if (!token.trim()) missing.push('DATABRICKS_PAT_TOKEN');
  if (!warehouse.trim()) missing.push('DATABRICKS_WAREHOUSE_ID');

  const search = envSearchPaths().map(p => ({ path: p, exists: fs.existsSync(p) }));

  return {
    repo_root: repoRoot(),
    cwd: process.cwd(),
    env_file: getLoadedEnvFile() ?? search.find(s => s.exists)?.path ?? null,
    env_search: search,
    missing,
    host_set: Boolean(host.trim()),
    token_set: Boolean(token.trim()),
    warehouse_set: Boolean(warehouse.trim()),
  };
}
