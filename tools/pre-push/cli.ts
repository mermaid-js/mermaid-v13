/**
 * The pre-push hook (`.husky/pre-push`, #879). It checks what the push changes since it left
 * `mermaid-v13` and leaves the full gate to CI:
 *
 * - A push of documentation only runs Prettier on those files.
 * - Any other push runs, at the same time: ESLint and Prettier on the changed files; cspell,
 *   knip and the typecheck over everything (the typecheck incrementally); the dependency,
 *   licence and generated-file checks; and the structural audit as CI's job runs it, which is
 *   `fallow audit` without coverage and runs no tests (D640).
 * - Not here: the full unit suite, the timing and language-budget projects, `pnpm build`.
 *
 * Every check writes a log under `node_modules/.cache/pre-push/`, and every failure is
 * reported, not only the first. `PRE_PUSH_FULL=1 git push` runs `pnpm check` instead (the hook
 * file handles it). `PRE_PUSH_BASE=<rev>` replaces the base commit, and naming checks runs only
 * those: `pnpm exec tsx tools/pre-push/cli.ts typecheck knip`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import { join, relative } from 'node:path';
import { pool, runProcess } from '../workspace/parallel.ts';
import type { CheckResult, TscStep, WorkspacePackage } from './plan.ts';
import {
  codeReferencePattern,
  findRemote,
  isDocsPath,
  lintTargets,
  reportLines,
  TARGET_BRANCH,
  typecheckSteps,
} from './plan.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const CACHE = join(ROOT, 'node_modules', '.cache', 'pre-push');
const TIMINGS = join(CACHE, 'timings.json');

const say = (text: string): void => void process.stdout.write(`${text}\n`);
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

const gitResult = (args: readonly string[]) =>
  spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

/** A git command's output, or undefined when it failed. */
function git(...args: string[]): string | undefined {
  const result = gitResult(args);
  return result.status === 0 ? result.stdout : undefined;
}

interface Finished {
  readonly code: number;
  readonly output: string;
}

/**
 * Runs a command and resolves with its exit code and its output, stdout and stderr in order
 * (`runProcess` in tools/workspace/parallel.ts, shared with `pnpm lint` and `check:static`).
 */
async function run(command: readonly string[], cwd = ROOT, env = process.env): Promise<Finished> {
  const [file = '', ...args] = command;
  const { code, signal, output } = await runProcess(file, args, { cwd, env });
  const note = signal ? `killed by ${signal}\n` : '';
  return { code: code ?? 1, output: `$ ${command.join(' ')}\n${output}${note}` };
}

interface Outcome {
  readonly ok: boolean;
  /** Everything the check printed: its log. */
  readonly output: string;
}

interface Check {
  readonly name: string;
  readonly run: () => Promise<Outcome>;
}

/** A check that is one command: it passes when the command exits with 0. */
const command = (name: string, ...argv: string[]): Check => ({
  name,
  run: async () => {
    const { code, output } = await run(argv);
    return { ok: code === 0, output };
  },
});

// --- The base commit and the changed files ---

type Base = { base: string } | { reason: string };

function overrideBase(rev: string): Base {
  const base = git('rev-parse', '--verify', `${rev}^{commit}`)?.trim();
  return base ? { base } : { reason: `PRE_PUSH_BASE=${rev} is not a commit` };
}

function remoteBase(): Base {
  const remote = findRemote(git('remote', '-v') ?? '');
  if (remote === undefined) return { reason: 'no remote points at mermaid-js/mermaid-v13' };
  const base = git('merge-base', 'HEAD', `refs/remotes/${remote}/${TARGET_BRANCH}`)?.trim();
  if (base) return { base };
  return { reason: `no merge base with ${remote}/${TARGET_BRANCH} (run \`git fetch ${remote}\`)` };
}

/** The commit the push is compared with, or the reason there is none. */
const findBase = (): Base =>
  process.env.PRE_PUSH_BASE ? overrideBase(process.env.PRE_PUSH_BASE) : remoteBase();

/** The files that differ between the base and HEAD; with `present`, without the deleted ones. */
function changedFiles(base: string, present = false): string[] | undefined {
  const filter = present ? ['--diff-filter=d'] : [];
  const list = git('diff', '--name-only', '-z', ...filter, base, 'HEAD');
  return list?.split('\0').filter((file) => file !== '');
}

/** Not searched for names of docs files: Markdown, and this folder's own examples. */
const NOT_CODE = [':(exclude)*.md', ':(exclude)tools/pre-push'];

/**
 * The first place where source code names one of these docs files, if any does. A search that
 * fails counts as a reference, so that the push is checked in full.
 */
function codeReference(docs: readonly string[]): string | undefined {
  const patterns = [...new Set(docs.map(codeReferencePattern))].flatMap((p) => ['-e', p]);
  const { status, stdout } = gitResult([
    'grep',
    '-I',
    '-n',
    '-E',
    ...patterns,
    '--',
    '.',
    ...NOT_CODE,
  ]);
  if (status === 1) return undefined;
  return status === 0 ? stdout.split('\n')[0] : 'the search for names failed';
}

// --- The checks ---

function lintChecks(files: readonly string[]): Check[] {
  const { eslint, prettier } = lintTargets(files);
  // Nothing left to lint when the push only deletes files.
  if (prettier.length === 0) return [];
  const checks = [
    command(
      'prettier',
      'pnpm',
      'exec',
      'prettier',
      '--cache',
      '--check',
      '--ignore-unknown',
      ...prettier
    ),
  ];
  if (eslint.length > 0)
    checks.unshift(
      command(
        'eslint',
        ...['pnpm', 'exec', 'eslint', '--quiet', '--cache', '--cache-strategy', 'content'],
        ...['--no-warn-ignored', ...eslint]
      )
    );
  return checks;
}

function readScripts(dir: string): Record<string, string | undefined> {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return manifest.scripts ?? {};
}

/** Every workspace package but the root, as `pnpm -r` sees them. */
async function workspacePackages(): Promise<WorkspacePackage[]> {
  const { code, output } = await run(['pnpm', 'ls', '-r', '--depth', '-1', '--json']);
  if (code !== 0) throw new Error(`pnpm ls failed:\n${output}`);
  const listed = JSON.parse(output.slice(output.indexOf('\n') + 1)) as { path: string }[];
  return listed
    .filter(({ path }) => relative(ROOT, path) !== '')
    .map(({ path }) => ({ dir: relative(ROOT, path), typecheck: readScripts(path).typecheck }));
}

/**
 * One `tsc -p` run with `--incremental`; its build info stays under `node_modules/.cache`. A
 * run that passed is one line of the log; a failed one is its whole output.
 */
async function runTsc({ cwd, project, buildInfo }: TscStep): Promise<Finished> {
  const dir = join(ROOT, cwd);
  const tsc = createRequire(join(dir, 'package.json')).resolve('typescript/bin/tsc');
  const buildInfoFile = join(CACHE, 'tsc', `${buildInfo}.tsbuildinfo`);
  const { code, output } = await run(
    [process.execPath, tsc, '-p', project, '--incremental', '--tsBuildInfoFile', buildInfoFile],
    dir
  );
  const title = `tsc -p ${project} (in ${cwd})`;
  return { code, output: code === 0 ? `passed: ${title}\n` : `\nFAILED: ${title}\n${output}` };
}

/**
 * `pnpm typecheck`, each `tsc` run made incremental. When the scripts hold something other
 * than plain `tsc -p` runs, `pnpm typecheck` runs as it is instead, so nothing is skipped.
 */
async function typecheck(): Promise<Outcome> {
  let steps: TscStep[];
  try {
    const script = readScripts(ROOT).typecheck ?? '';
    steps = typecheckSteps(script, await workspacePackages());
  } catch (error) {
    const { code, output } = await run(['pnpm', 'typecheck']);
    return { ok: code === 0, output: `Not incremental: ${String(error)}\n${output}` };
  }
  const limit = Math.max(2, Math.floor(availableParallelism() / 2));
  const results = await pool(steps, limit, runTsc);
  return {
    ok: results.every(({ code }) => code === 0),
    // Failed runs last, where the report's tail shows them.
    output: [...results]
      .sort((a, b) => a.code - b.code)
      .map(({ output }) => output)
      .join(''),
  };
}

/**
 * CI's "Structural audit" job (`structure`): `fallow audit` with `.fallowrc.pr.json`, without
 * coverage and without a test run (D640). The check passes when fallow exits with 0. CRAP
 * findings are warnings there, because without coverage fallow can only estimate CRAP; the
 * nightly fallow run, which has coverage, gates on it.
 */
async function structuralAudit(base: string): Promise<Outcome> {
  const { code, output } = await run([
    ...['pnpm', 'exec', 'fallow', 'audit', '-c', '.fallowrc.pr.json'],
    ...['--base', base, '--quiet'],
  ]);
  return { ok: code === 0, output };
}

const allChecks = (base: string, files: readonly string[]): Check[] => [
  ...lintChecks(files),
  command('cspell', 'pnpm', 'lint:spell'),
  command('knip', 'pnpm', 'lint:knip'),
  { name: 'typecheck', run: typecheck },
  command('check:deps', 'pnpm', 'check:deps'),
  command('check:licenses', 'pnpm', 'check:licenses'),
  command('check-generated', 'pnpm', 'exec', 'tsx', 'tools/workspace/check-generated-cli.ts'),
  { name: 'structural audit', run: () => structuralAudit(base) },
];

// --- Running and reporting ---

interface Timed extends CheckResult {
  readonly ms: number;
}

async function runCheck({ name, run: start }: Check): Promise<Timed> {
  const began = performance.now();
  const outcome = await start().catch((error: unknown) => ({ ok: false, output: String(error) }));
  const ms = performance.now() - began;
  const log = join(CACHE, `${name.replaceAll(/[^a-z]+/g, '-')}.log`);
  writeFileSync(log, outcome.output);
  say(`  ${outcome.ok ? '✓' : '✗'} ${name.padEnd(17)}${seconds(ms).padStart(8)}`);
  return { ...outcome, name, ms, log: relative(ROOT, log) };
}

/** Runs the checks at the same time, waits for all of them, and returns the exit code. */
async function runChecks(mode: string, checks: readonly Check[]): Promise<number> {
  mkdirSync(join(CACHE, 'tsc'), { recursive: true });
  const began = performance.now();
  const results = await Promise.all(checks.map(runCheck));
  const totalMs = Math.round(performance.now() - began);
  for (const line of reportLines(results)) say(line);
  const tasks = results.map(({ name, ms, ok }) => ({ name, ms: Math.round(ms), ok }));
  writeFileSync(TIMINGS, JSON.stringify({ mode, totalMs, tasks }, null, 2) + '\n');
  const ok = results.every((result) => result.ok);
  if (ok) say(`pre-push: passed in ${seconds(totalMs)}. CI runs the unit tests and the build.`);
  return ok ? 0 : 1;
}

/** The whole gate, when the hook cannot tell what the push changes. */
function fullCheck(reason: string): number {
  say(`pre-push: ${reason}; running the full \`pnpm check\`.`);
  return spawnSync('pnpm', ['check'], { cwd: ROOT, stdio: 'inherit' }).status ?? 1;
}

/** The checks named on the command line (`cli.ts typecheck knip`), or all of them. */
function selected(checks: readonly Check[]): readonly Check[] {
  const names = process.argv.slice(2);
  const unknown = names.filter((name) => !checks.some((check) => check.name === name));
  if (unknown.length > 0)
    throw new Error(
      `No check is called ${unknown.join(', ')}: ${checks.map(({ name }) => name).join(', ')}`
    );
  return names.length === 0 ? checks : checks.filter(({ name }) => names.includes(name));
}

/** A push of documentation only, unless source code names one of the files. */
function docsOnly(files: readonly string[]): boolean {
  if (!files.every(isDocsPath)) return false;
  const reference = codeReference(files);
  if (reference) say(`pre-push: not a docs-only push, code names a changed file: ${reference}`);
  return reference === undefined;
}

async function checkPush(base: string): Promise<number> {
  // Deleted files count as changes (a deleted module can break its importers); only the
  // file lists for ESLint and Prettier leave them out.
  const files = changedFiles(base);
  const present = changedFiles(base, true);
  if (files === undefined || present === undefined) return fullCheck('git diff failed');
  const changed = `${files.length} ${files.length === 1 ? 'file' : 'files'} changed since ${base.slice(0, 9)}`;
  if (files.length === 0) {
    say(`pre-push: ${changed}; nothing to check.`);
    return 0;
  }
  if (docsOnly(files)) {
    say(`pre-push: ${changed}, all documentation; checking their formatting only.`);
    return runChecks('docs', lintChecks(present));
  }
  say(`pre-push: ${changed}; logs in ${relative(ROOT, CACHE)}/`);
  return runChecks('checks', selected(allChecks(base, present)));
}

const found = findBase();
process.exitCode = 'reason' in found ? fullCheck(found.reason) : await checkPush(found.base);
