/**
 * `pnpm lint`: ESLint in shards (`lint.ts`), Prettier and cspell, all side by side
 * (`parallel.ts`), at a lower priority so that in `pnpm check` they yield to the unit tests.
 * Each runs to the end; the exit code is 1 when any failed.
 *
 * ESLint's cache is one file per shard in the `.eslintcache/` directory (keyed on file content,
 * as before). An `.eslintcache` file from the single-process run is removed first.
 */
import { rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { availableParallelism } from 'node:os';
import { ROOT } from './diagrams.ts';
import { lintShards, shardArgs } from './lint.ts';
import { printResult, runAll, type Task } from './parallel.ts';

const CACHE_DIR = '.eslintcache';
const ESLINT_ARGS = ['--quiet', '--cache', '--cache-strategy', 'content'];

try {
  if (statSync(join(ROOT, CACHE_DIR)).isFile()) rmSync(join(ROOT, CACHE_DIR));
} catch {
  // No cache yet.
}

const require = createRequire(import.meta.url);
const eslint = join(dirname(require.resolve('eslint/package.json')), 'bin', 'eslint.js');
const color = process.stdout.isTTY ? ['--color'] : [];

// About a third of the cores: with Prettier, cspell and (in `pnpm check`) the other steps
// beside them, more shards only parse the shared packages more often.
const SHARDS = Math.max(2, Math.round(availableParallelism() / 3));

const tasks: Task[] = [
  ...lintShards(ROOT, SHARDS).map((shard) => ({
    label: `eslint (${shard.name}: ${shard.paths.length} paths)`,
    command: process.execPath,
    args: [eslint, ...color, ...shardArgs(shard, ESLINT_ARGS, CACHE_DIR)],
    nice: true,
  })),
  {
    label: 'prettier --check',
    command: 'pnpm',
    args: ['exec', 'prettier', '--cache', '--check', '.'],
    nice: true,
  },
  { label: 'cspell', command: 'pnpm', args: ['lint:spell'], nice: true },
];

const results = await runAll(tasks, { cwd: ROOT, onDone: printResult });
const failed = results.filter((r) => !r.ok);
process.stdout.write(`lint: ${results.length - failed.length} of ${results.length} steps passed\n`);
if (failed.length > 0) process.exitCode = 1;
