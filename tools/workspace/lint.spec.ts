import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { ROOT } from './diagrams.ts';
import { lintShards, shardArgs } from './lint.ts';

const scripts = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

describe('the ESLint shards', { timeout: 120_000 }, () => {
  const shards = lintShards(ROOT, 5);

  it('lint every file `eslint .` lints, each in exactly one shard', async () => {
    const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((f) => /\.(?:[cm]?[jt]s)$/.test(f));
    expect(files.length).toBeGreaterThan(1000);

    const whole = new ESLint({ cwd: ROOT });
    const byShard = shards.map((shard) => ({
      shard,
      eslint: new ESLint({ cwd: ROOT, ignorePatterns: [...shard.ignore] }),
    }));
    const missed: string[] = [];
    const twice: string[] = [];
    let linted = 0;
    for (const file of files) {
      if (await whole.isPathIgnored(file)) continue;
      linted++;
      let owners = 0;
      for (const { shard, eslint } of byShard) {
        const under = shard.paths.some((p) => p === '.' || file.startsWith(`${p}/`));
        if (under && !(await eslint.isPathIgnored(file))) owners++;
      }
      if (owners === 0) missed.push(file);
      if (owners > 1) twice.push(file);
    }
    expect(linted).toBeGreaterThan(1000);
    expect(missed).toEqual([]);
    expect(twice).toEqual([]);
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
