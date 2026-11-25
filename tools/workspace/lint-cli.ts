/**
 * `pnpm lint`: ESLint in shards (`lint.ts`), Prettier and cspell, all side by side
 * (`parallel.ts`). Each runs to the end; the exit code is 1 when any failed.
 *
 * ESLint's cache is one file per shard in the `.eslintcache/` directory (keyed on file content,
 * as before). An `.eslintcache` file from the single-process run is removed first.
 */
import { rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { ROOT } from './diagrams.ts';
import { lintShards, shardArgs, shardCount } from './lint.ts';
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
// A shard linted without a cache (a pull request that changes the lockfile) peaks right at
// Node's default heap of about 4 GB on the 4-vCPU CI runner, and dies there now and then.
// A heap size set in NODE_OPTIONS (the pre-push hook sets one) wins over this default.
const heap = /max[-_]old[-_]space[-_]size/.test(process.env.NODE_OPTIONS ?? '')
  ? []
  : ['--max-old-space-size=6144'];

const tasks: Task[] = [
  ...lintShards(ROOT, shardCount(availableParallelism())).map((shard) => ({
    label: `eslint (${shard.name}: ${shard.paths.length} paths)`,
    command: process.execPath,
    args: [...heap, eslint, ...color, ...shardArgs(shard, ESLINT_ARGS, CACHE_DIR)],
  })),
  {
    label: 'prettier --check',
    command: 'pnpm',
    args: ['exec', 'prettier', '--cache', '--check', '.'],
  },
  { label: 'cspell', command: 'pnpm', args: ['lint:spell'] },
];

const results = await runAll(tasks, { cwd: ROOT, onDone: printResult });
const failed = results.filter((r) => !r.ok);
process.stdout.write(`lint: ${results.length - failed.length} of ${results.length} steps passed\n`);
if (failed.length > 0) process.exitCode = 1;
