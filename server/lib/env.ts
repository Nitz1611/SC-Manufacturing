import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

/** Repo root (folder containing root package.json with npm workspaces). */
export function repoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
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

function envCandidates(root: string): string[] {
  const unique = new Set<string>([
    path.join(root, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
  ]);
  return [...unique];
}

export function loadEnv(): string | null {
  const root = repoRoot();
  for (const envPath of envCandidates(root)) {
    if (!fs.existsSync(envPath)) continue;
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      console.log(`[env] loaded ${envPath}`);
      return envPath;
    }
    console.warn(`[env] failed to parse ${envPath}: ${result.error.message}`);
  }
  console.warn(`[env] no .env found (looked in ${envCandidates(root).join(', ')})`);
  return null;
}

export function sqlEnvStatus(): {
  env_file: string | null;
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

  const root = repoRoot();
  const envFile = envCandidates(root).find(p => fs.existsSync(p)) ?? null;

  return {
    env_file: envFile,
    missing,
    host_set: Boolean(host.trim()),
    token_set: Boolean(token.trim()),
    warehouse_set: Boolean(warehouse.trim()),
  };
}
