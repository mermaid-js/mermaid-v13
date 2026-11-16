/**
 * Times the old pre-push hook (`pnpm check`) and the new one (`cli.ts`, #879) on three kinds of
 * push, each cold (no caches, as in a new worktree) and warm (run again at once). Run it on a
 * steady machine, in a clean checkout with `pnpm install` done:
 *
 *   pnpm exec tsx tools/pre-push/time-cli.ts            # about 20 minutes
 *   pnpm exec tsx tools/pre-push/time-cli.ts --new-only # skips `pnpm check`: a few minutes
 *
 * For each kind it commits a one-line edit, runs the hooks against the commit it started
 * from, and resets to that commit when it is done. It prints a Markdown table. `pnpm check`
 * does the same work for every push, so it is timed once. The structural audit has a column of
 * its own: vitest's `--changed` can take a minute to work out which tests a change reaches.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const TIMINGS = join(ROOT, 'node_modules', '.cache', 'pre-push', 'timings.json');
/** What a new worktree does not have: the lint caches, the hook's tsc build info, fallow's cache. */
const CACHES = ['.eslintcache', 'node_modules/.cache', 'coverage', '.fallow'];

/** The pushes: a name for the table and the file that gets a one-line edit. */
const PUSHES: readonly (readonly [string, string, string])[] = [
  ['docs only', 'CODE_OF_CONDUCT.md', '\n<!-- pre-push timing -->\n'],
  ['one diagram package', 'packages/diagram-pie/src/index.ts', '\n// pre-push timing\n'],
  ['packages/core', 'packages/core/src/index.ts', '\n// pre-push timing\n'],
];

/** What `.husky/pre-push` sets for both hooks. */
const HOOK_ENV = { ...process.env, NODE_OPTIONS: '--max_old_space_size=8192' };

const say = (text: string): void => void process.stdout.write(`${text}\n`);
const seconds = (ms: number): string => `${(ms / 1000).toFixed(0)} s`;

function git(...args: string[]): string {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${result.stderr}`);
  return result.stdout.trim();
}

interface Timing {
  readonly ms: number;
  readonly passed: boolean;
}

/** Runs a hook's command and times it. Its output is dropped; a failure is marked in the table. */
function time(command: readonly string[], env: NodeJS.ProcessEnv): Timing {
  const [file = '', ...args] = command;
  const began = performance.now();
  const { status } = spawnSync(file, args, { cwd: ROOT, env, stdio: 'ignore' });
  return { ms: performance.now() - began, passed: status === 0 };
}

const cell = ({ ms, passed }: Timing): string => `${seconds(ms)}${passed ? '' : ' (failed)'}`;

function clearCaches(): void {
  for (const path of CACHES) rmSync(join(ROOT, path), { recursive: true, force: true });
}

interface HookTimings {
  readonly tasks: readonly { readonly name: string; readonly ms: number }[];
}

/** From the new hook's last run: the structural audit's time, and the slowest other check. */
function breakdown(): [audit: string, slowestOther: string] {
  const { tasks } = JSON.parse(readFileSync(TIMINGS, 'utf8')) as HookTimings;
  const audit = tasks.find(({ name }) => name === 'structural audit');
  const others = tasks.filter((task) => task !== audit).sort((a, b) => b.ms - a.ms);
  const slowest = others[0];
  return [
    audit ? seconds(audit.ms) : 'not run',
    slowest ? `${slowest.name} ${seconds(slowest.ms)}` : 'none',
  ];
}

/** One table row for the new hook: its total, then the breakdown of that run. */
function newHookRow(push: string, run: string, env: NodeJS.ProcessEnv): string {
  const total = time(['pnpm', 'exec', 'tsx', 'tools/pre-push/cli.ts'], env);
  return `| ${push} | new, ${run} | ${cell(total)} | ${breakdown().join(' | ')} |`;
}

function oldHookRows(env: NodeJS.ProcessEnv): string[] {
  clearCaches();
  const cold = time(['pnpm', 'check'], env);
  const warm = time(['pnpm', 'check'], env);
  return [
    `| any | old (\`pnpm check\`), cold | ${cell(cold)} | | |`,
    `| any | old (\`pnpm check\`), warm | ${cell(warm)} | | |`,
  ];
}

/** Commits the push's edit, times the new hook cold and warm, and goes back to `start`. */
function timePush([push, file, edit]: (typeof PUSHES)[number], start: string): string[] {
  const env = { ...HOOK_ENV, PRE_PUSH_BASE: start };
  try {
    appendFileSync(join(ROOT, file), edit);
    git('commit', '--no-verify', '--quiet', '--all', '--message', `timing: ${push}`);
    clearCaches();
    return [newHookRow(push, 'cold', env), newHookRow(push, 'warm', env)];
  } finally {
    git('reset', '--hard', '--quiet', start);
  }
}

function main(): void {
  if (git('status', '--porcelain') !== '')
    throw new Error('The working tree has changes. Commit them first: this script resets it.');
  const start = git('rev-parse', 'HEAD');
  // An interrupted run must not leave its timing commit on the branch.
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      git('reset', '--hard', '--quiet', start);
      process.exit(1);
    });
  const rows = PUSHES.flatMap((push) => {
    say(`Timing the new hook: ${push[0]} …`);
    return timePush(push, start);
  });
  if (!process.argv.includes('--new-only')) {
    say('Timing the old hook, cold and warm …');
    rows.push(...oldHookRows(HOOK_ENV));
  }
  say(`\nAt ${start.slice(0, 9)}:\n`);
  say('| Push | Hook | Total | Structural audit | Slowest other check |');
  say('| --- | --- | --- | --- | --- |');
  say(rows.join('\n'));
}

main();
