import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function isRepoRoot(dir: string): boolean {
  const pkg = path.join(dir, 'package.json');
  if (!existsSync(pkg)) return false;
  try {
    return Boolean(JSON.parse(readFileSync(pkg, 'utf8')).workspaces);
  } catch {
    return false;
  }
}

/** The monorepo root (the folder whose package.json declares workspaces). */
export function findRepoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (let depth = 0; depth < 8; depth++) {
    if (isRepoRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start);
}

export const REPO_ROOT = findRepoRoot();
export const DATA_DIR = path.join(REPO_ROOT, '.data');
export const WEB_DIST_DIR = path.join(REPO_ROOT, 'apps', 'web', 'dist');
