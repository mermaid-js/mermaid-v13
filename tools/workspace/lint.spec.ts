import { readdirSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { ROOT } from './diagrams.ts';
import { lintShards, shardArgs, shardCount } from './lint.ts';

const scripts = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

/** Every file under `dir`, relative to ROOT, as ESLint walks the tree (not git's list). */
function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = dir === '.' ? entry.name : `${dir}/${entry.name}`;
    // ESLint never lints these (its own defaults and the config's global ignores).
    if (['node_modules', '.git', 'dist', '.claude'].includes(entry.name)) return [];
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe('the ESLint shards', { timeout: 120_000 }, () => {
  const shards = lintShards(ROOT, 5);
  const packageDirs = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `packages/${e.name}`);

  it('put every package directory in exactly one shard, and the rest in `rest`, for any count', () => {
    for (const count of [2, 3, 5, 8, shardCount(availableParallelism()), shardCount(4)]) {
      const all = lintShards(ROOT, count);
      const rest = all.filter((s) => s.name === 'rest');
      expect(rest, `count ${count}`).toEqual([
        { name: 'rest', paths: ['.'], ignore: ['packages/*/'], weight: 0 },
      ]);
      const paths = all.filter((s) => s.name !== 'rest').flatMap((s) => [...s.paths]);
      expect(paths.sort(), `count ${count}`).toEqual([...packageDirs].sort());
      expect(all.filter((s) => s.name !== 'rest').every((s) => s.ignore.length === 0)).toBe(true);
    }
  });

  it('leave to the package shards exactly the files under a package directory', async () => {
    // The rest shard is `.` with `packages/*/` ignored; by ESLint's own ignore logic that
    // removes the files under a package directory and nothing else.
    const files = walk('.').filter((f) => /\.(?:[cm]?[jt]s)$/.test(f));
    const whole = new ESLint({ cwd: ROOT });
    const rest = new ESLint({ cwd: ROOT, ignorePatterns: ['packages/*/'] });
    const wrong: string[] = [];
    let linted = 0;
    for (const file of files) {
      if (await whole.isPathIgnored(file)) continue;
      linted++;
      const inPackage = packageDirs.some((dir) => file.startsWith(`${dir}/`));
      if ((await rest.isPathIgnored(file)) !== inPackage) wrong.push(file);
    }
    expect(linted).toBeGreaterThan(1000);
    expect(wrong).toEqual([]);
  });

  it('are package shards of about equal size, and the rest', () => {
    expect(shards.map((s) => s.name)).toEqual([
      'packages-1',
      'packages-2',
      'packages-3',
      'packages-4',
      'rest',
    ]);
    const weights = shards.slice(0, -1).map((s) => s.weight);
    // Packing the largest package first into the lightest shard keeps them within one package.
    const largest = Math.max(...lintShards(ROOT, 100).map((s) => s.weight));
    expect(Math.max(...weights) - Math.min(...weights)).toBeLessThanOrEqual(largest);
  });

  it('give each shard its own cache file and the flags `pnpm lint` gives ESLint', () => {
    const [first] = shards;
    expect(shardArgs(first!, ['--quiet'], '.eslintcache')).toEqual([
      '--quiet',
      '--cache-location',
      join('.eslintcache', 'packages-1'),
      '--no-error-on-unmatched-pattern',
      ...first!.paths,
    ]);
    const rest = shards.find((s) => s.name === 'rest')!;
    expect(shardArgs(rest, [], 'c')).toEqual([
      '--cache-location',
      join('c', 'rest'),
      '--ignore-pattern',
      'packages/*/',
      '.',
    ]);
  });

  it('are what `pnpm lint` runs', () => {
    expect(scripts.lint).toBe('tsx tools/workspace/lint-cli.ts');
  });
});
