/**
 * `pnpm exec tsx tools/ci/scope-cli.ts`: the first job of ci.yml. Decides what the run checks
 * (`scope.ts`) from the change `HEAD^1..HEAD`: on a PR the checkout is the merge commit,
 * so that is the PR; on a push to mermaid-v13 it is what the push added. Writes `scope`
 * (`code` or `docs`) and `readers` (space-separated source files, for `vitest related`) to
 * GITHUB_OUTPUT and the reasoning to the job summary.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeReferencePattern } from '../pre-push/plan.ts';
import { ciScope, summarize } from './scope.ts';

const ROOT = join(import.meta.dirname, '..', '..');
/** Not searched for names of docs files: Markdown, and the examples of the two scope tools. */
const NOT_CODE = [':(exclude)*.md', ':(exclude)tools/pre-push', ':(exclude)tools/ci'];

const git = (args: string[]): { status: number | null; stdout: string } =>
  spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const lines = (text: string): string[] => text.split('\n').filter((line) => line !== '');

function changedFiles(): string[] | undefined {
  const { status, stdout } = git(['diff', '--name-only', 'HEAD^1', 'HEAD']);
  return status === 0 ? lines(stdout) : undefined;
}

/** The files that name one of `docs`. `git grep` exits 1 when nothing matches. */
function readersOf(docs: readonly string[]): string[] | undefined {
  if (docs.length === 0) return [];
  const patterns = [...new Set(docs.map(codeReferencePattern))].flatMap((p) => ['-e', p]);
  const { status, stdout } = git(['grep', '-I', '-l', '-E', ...patterns, '--', '.', ...NOT_CODE]);
  if (status === 1) return [];
  return status === 0 ? lines(stdout) : undefined;
}

const files = changedFiles();
const result = ciScope({
  event: process.env.GITHUB_EVENT_NAME ?? 'local',
  files,
  readers: files === undefined ? undefined : readersOf(files),
});
const text = summarize(result);
process.stdout.write(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `scope=${result.scope}\nreaders=${result.readers.join(' ')}\n`
  );
}
