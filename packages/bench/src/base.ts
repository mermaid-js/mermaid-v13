/**
 * The `v13-base` renderer: the production v13 bundle built from another commit (by default the
 * tip of `origin/mermaid-v13`; on CI the PR's base). The bench compares it with the working tree,
 * so a PR's timings are shown next to the branch it merges into.
 *
 * The commit's `packages/` tree is written out with `git archive` (no checkout, no install) and
 * its workspace packages are linked into a `node_modules` beside it, so `mermaid` and
 * `@mermaid-js/*` resolve inside that tree rather than to the working tree's packages. Workspace
 * packages have no runtime dependencies (R-PERF-2), so nothing else needs installing.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = fileURLToPath(new URL('../', import.meta.url));
/** Extracted commits, one directory per sha (kept between runs: a commit never changes). */
const CACHE_DIR = join(PKG, 'node_modules', '.cache', 'bench-v13-base');

export const DEFAULT_BASE_REF = 'origin/mermaid-v13';

export interface BaseTree {
  ref: string;
  sha: string;
  /** Root of the extracted tree; the mermaid entry is `packages/mermaid/src/index.ts`. */
  dir: string;
  entry: string;
  /** `<mermaid version> (<short sha>)`. */
  version: string;
}

const git = (args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Resolves `ref` to a commit; throws with a readable message when it does not exist. */
export function resolveRef(ref: string): string {
  try {
    return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    throw new Error(`base ref "${ref}" is not a commit here (fetch it, or pass --base <ref>)`);
  }
}

/** Links every workspace package of the extracted tree into its root `node_modules`. */
function linkWorkspace(dir: string): void {
  const packages = join(dir, 'packages');
  for (const name of readdirSync(packages)) {
    const manifest = join(packages, name, 'package.json');
    if (!existsSync(manifest)) continue;
    const pkgName = (JSON.parse(readFileSync(manifest, 'utf8')) as { name: string }).name;
    const link = join(dir, 'node_modules', pkgName);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(join(packages, name), link, 'dir');
  }
}

/** Writes the commit's sources out (once per sha) and returns where they are. */
export function extractBase(ref: string): BaseTree {
  const sha = resolveRef(ref);
  const dir = join(CACHE_DIR, sha);
  const done = join(dir, '.complete');
  if (!existsSync(done)) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    // tsconfig.json too: package tsconfigs extend it, and esbuild reads them.
    // Run from the repository root: archive paths are relative to the working directory.
    const tar = execFileSync('git', ['archive', '--format=tar', sha, 'packages', 'tsconfig.json'], {
      cwd: git(['rev-parse', '--show-toplevel']),
      maxBuffer: 1 << 30,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    execFileSync('tar', ['-x', '-C', dir], { input: tar });
    linkWorkspace(dir);
    writeFileSync(done, sha);
  }
  const entry = join(dir, 'packages', 'mermaid', 'src', 'index.ts');
  if (!existsSync(entry))
    throw new Error(`base ${sha.slice(0, 9)} has no ${entry.slice(dir.length + 1)}`);
  const { version } = JSON.parse(
    readFileSync(join(dir, 'packages', 'mermaid', 'package.json'), 'utf8')
  ) as { version: string };
  return { ref, sha, dir, entry, version: `${version} (${sha.slice(0, 9)})` };
}
