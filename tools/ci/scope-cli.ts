/**
 * `pnpm exec tsx tools/ci/scope-cli.ts`: the first job of ci.yml. Decides what the run checks
 * (`scope.ts`) from the change `HEAD^1..HEAD`: on a PR the checkout is the merge commit, so
 * that is the PR; on a push to mermaid-v13 it is what the push added. Writes to GITHUB_OUTPUT:
 * `scope` (`code` or `docs`), `readers` (space-separated source files, for `vitest related`
 * in a `docs` run), `tests` (`all`, `related` or `none`) and `test_files` (space-separated
 * test files, for a `related` run). The reasoning goes to the job summary.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeReferencePattern } from '../pre-push/plan.ts';
import {
  ciScope,
  listedFile,
  READS_THE_TREE,
  summarize,
  testFiles,
  type CiScope,
} from './scope.ts';

const ROOT = join(import.meta.dirname, '..', '..');
/** Not searched for names of docs files: Markdown, and the examples of the two scope tools. */
const NOT_CODE = [':(exclude)*.md', ':(exclude)tools/pre-push', ':(exclude)tools/ci'];

const run = (command: string, args: string[]): { status: number | null; stdout: string } =>
  spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const git = (args: string[]) => run('git', args);

const lines = (text: string): string[] => text.split('\n').filter((line) => line !== '');

function changedFiles(): string[] | undefined {
  const { status, stdout } = git(['diff', '--name-only', 'HEAD^1', 'HEAD']);
  return status === 0 ? lines(stdout) : undefined;
}

/** `git grep -l`: the matching files, none when it exits 1, undefined when the search failed. */
function grepFiles(args: string[]): string[] | undefined {
  const { status, stdout } = git(['grep', '-I', '-l', '-E', ...args]);
  if (status === 1) return [];
  return status === 0 ? lines(stdout) : undefined;
}

/** The files that name one of `docs`. */
function readersOf(docs: readonly string[]): string[] | undefined {
  if (docs.length === 0) return [];
  const patterns = [...new Set(docs.map(codeReferencePattern))].flatMap((p) => ['-e', p]);
  return grepFiles([...patterns, '--', '.', ...NOT_CODE]);
}

/**
 * The test files of a `related` run: what vitest finds affected since `HEAD^1`, and the specs
 * that read the tree. Undefined when either search failed.
 */
function relatedTestFiles(): string[] | undefined {
  const listed = run('pnpm', ['exec', 'vitest', 'list', '--changed', 'HEAD^1', '--filesOnly']);
  const treeReaders = grepFiles(['-e', READS_THE_TREE, '--', '*.spec.ts']);
  if (listed.status !== 0 || treeReaders === undefined) return undefined;
  return testFiles(lines(listed.stdout).map(listedFile), treeReaders);
}

const files = changedFiles();
let result: CiScope = ciScope({
  event: process.env.GITHUB_EVENT_NAME ?? 'local',
  files,
  readers: files === undefined ? undefined : readersOf(files),
});
let related: string[] = [];
if (result.tests === 'related') {
  const found = relatedTestFiles();
  // No list is no proof that few tests are affected: run them all.
  if (found === undefined || found.length === 0) {
    result = { ...result, tests: 'all', testsReason: 'the affected tests could not be listed' };
  } else {
    related = found;
  }
}

const text = summarize(result, result.tests === 'related' ? related.length : undefined);
process.stdout.write(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `scope=${result.scope}`,
      `readers=${result.readers.join(' ')}`,
      `tests=${result.tests}`,
      `test_files=${related.join(' ')}`,
      '',
    ].join('\n')
  );
}
