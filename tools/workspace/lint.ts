/**
 * `pnpm lint`'s ESLint step, split so it can use more than one core. ESLint's type-aware rules
 * build a TypeScript program per tsconfig, so one `eslint .` process spends most of its time
 * building and querying about fifty programs one after another, on one core, near the heap
 * limit. Here the package directories (which are also the tsconfig boundaries) are packed
 * into a few shards of about equal size, and each shard is one `eslint` process with its own
 * cache file. A few large shards, not one per package: in one process the programs share
 * their parsed files, so every extra process costs the parsing of core and shared again.
 *
 * The shards cover exactly what `eslint .` lints: the package shards take whole directories
 * under `packages/`, and the `rest` shard is `.` with those directories ignored. ESLint's
 * result for a file does not depend on which other files the same run lints (rules, disable
 * directives, the suppressions file and the cache all work per file), so the shards report
 * what one run would. Every shard runs even after another failed.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface LintShard {
  /** A short name, also the cache file's name. */
  readonly name: string;
  /** The paths ESLint is given. */
  readonly paths: readonly string[];
  /** `--ignore-pattern` values. */
  readonly ignore: readonly string[];
  /** Files ESLint reads under the paths: a size estimate, to balance the shards. */
  readonly weight: number;
}

/** What the rest shard leaves to the package shards. */
const PACKAGE_DIRS = 'packages/*/';

const SOURCE = /\.(?:[cm]?[jt]s)$/;
const SKIP = new Set(['node_modules', 'dist', 'generated', 'coverage', '.git']);

function countFiles(dir: string): number {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name));
    else if (SOURCE.test(entry.name)) n++;
  }
  return n;
}

/**
 * The shards, largest first: `count - 1` package shards (largest package first into the
 * lightest shard) and the `rest` shard, everything outside `packages/*` (tools, e2e, root
 * config files).
 */
export function lintShards(root: string, count: number): LintShard[] {
  const packages = readdirSync(join(root, 'packages'))
    .filter((name) => statSync(join(root, 'packages', name)).isDirectory())
    .map((name) => ({ path: `packages/${name}`, weight: countFiles(join(root, 'packages', name)) }))
    .sort((a, b) => b.weight - a.weight || (a.path < b.path ? -1 : 1));
  const bins = Array.from({ length: Math.max(1, count - 1) }, () => ({
    paths: [] as string[],
    weight: 0,
  }));
  for (const pkg of packages) {
    const lightest = bins.reduce((min, bin) => (bin.weight < min.weight ? bin : min));
    lightest.paths.push(pkg.path);
    lightest.weight += pkg.weight;
  }
  const shards: LintShard[] = bins
    .filter((bin) => bin.paths.length > 0)
    .map((bin, i) => ({
      name: `packages-${i + 1}`,
      paths: [...bin.paths].sort(),
      ignore: [],
      weight: bin.weight,
    }));
  const rest = { name: 'rest', paths: ['.'], ignore: [PACKAGE_DIRS], weight: 0 };
  return [...shards, rest];
}

/**
 * The ESLint arguments for a shard: `baseArgs` (the flags `pnpm lint` gives ESLint), its own
 * cache file under `cacheDir`, its ignores and paths. A package shard whose files are all
 * ignored is not an error, since `eslint .` would not report one either.
 */
export function shardArgs(
  shard: LintShard,
  baseArgs: readonly string[],
  cacheDir: string
): string[] {
  return [
    ...baseArgs,
    '--cache-location',
    join(cacheDir, shard.name),
    ...(shard.paths[0] === '.' ? [] : ['--no-error-on-unmatched-pattern']),
    ...shard.ignore.flatMap((pattern) => ['--ignore-pattern', pattern]),
    ...shard.paths,
  ];
}

/**
 * How many shards `pnpm lint` uses on `cores` cores: about a third of them (at least 2). With
 * Prettier, cspell and, in `pnpm check`, the other steps beside them, more shards only parse
 * the shared packages more often.
 */
export function shardCount(cores: number): number {
  return Math.max(2, Math.round(cores / 3));
}
