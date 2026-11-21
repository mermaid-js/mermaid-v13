/**
 * `pnpm exec tsx tools/ci/scope-cli.ts`: the first job of ci.yml. Decides what the run checks
 * (`scope.ts`) from the change `HEAD^1..HEAD`: on a PR the checkout is the merge commit, so
 * that is the PR; on a push to mermaid-v13 it is what the push added. Writes to GITHUB_OUTPUT:
 * `scope` (`code` or `docs`), `readers` (space-separated source files, for `vitest related`
 * in `docs-tests`), `tests` (`all`, `related` or `none`) and `test_files` (space-separated
 * test files, for a `related` run: those the import graph finds from the changed files and
 * from the readers of changed fixtures and snapshots, D648, and the specs that read the
 * tree). The reasoning goes to the job summary.
 */
import { appendFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { codeReferencePattern, isDocsPath } from '../pre-push/plan.ts';
import {
  ciScope,
  isChangeset,
  isFixture,
  isSnapshot,
  READS_THE_TREE,
  summarize,
  testFiles,
  type CiScope,
} from './scope.ts';
import { dataReaders, git, grepFiles, lines, ROOT } from './scope-git.ts';

/** Not searched for names of docs files: Markdown, and the examples of the two scope tools. */
const NOT_CODE = [':(exclude)*.md', ':(exclude)tools/pre-push', ':(exclude)tools/ci'];

function changedFiles(): string[] | undefined {
  const { status, stdout } = git(['diff', '--name-only', 'HEAD^1', 'HEAD']);
  return status === 0 ? lines(stdout) : undefined;
}

/** The files the change deletes, a rename's old path included. Undefined when git failed. */
function deletedFiles(): string[] | undefined {
  const args = ['diff', '--name-only', '--no-renames', '--diff-filter=D', 'HEAD^1', 'HEAD'];
  const { status, stdout } = git(args);
  return status === 0 ? lines(stdout) : undefined;
}

/** A string literal that names the changesets folder: `'.changeset'`, `".changeset/config.json"`. */
const CHANGESETS_FOLDER = '[\'"`](\\.\\.?/)*\\.changeset[/\'"`]';

/**
 * The files that read what `changed` holds besides source: those that name one of its docs
 * files, and, when a changeset changed, those that name the changesets folder.
 */
function readersOf(changed: readonly string[]): string[] | undefined {
  const patterns = [...new Set(changed.filter(isDocsPath).map(codeReferencePattern))];
  if (changed.some(isChangeset)) patterns.push(CHANGESETS_FOLDER);
  if (patterns.length === 0) return [];
  return grepFiles([...patterns.flatMap((p) => ['-e', p]), '--', '.', ...NOT_CODE]);
}

/**
 * The test files that vitest's import graph finds related to `sources` (repo-relative): the
 * specs among them and the specs that import one of them, as `vitest related` and
 * `vitest list --changed` select. Undefined when vitest failed.
 */
async function relatedSpecs(sources: readonly string[]): Promise<string[] | undefined> {
  try {
    const { createVitest } = await import('vitest/node');
    const related = sources.map((file) => join(ROOT, file));
    const vitest = await createVitest('test', { root: ROOT, watch: false, run: true, related });
    try {
      const specs = await vitest.getRelevantTestSpecifications();
      return specs.map((spec) => relative(ROOT, spec.moduleId));
    } finally {
      await vitest.close();
    }
  } catch {
    return undefined;
  }
}

/**
 * The test files of a `related` run: what vitest finds related to the changed files and to
 * the readers of changed fixtures and snapshots, and the specs that read the tree. Undefined
 * when either search failed.
 */
async function relatedTestFiles(
  changed: readonly string[],
  scope: CiScope
): Promise<string[] | undefined> {
  const listed = await relatedSpecs([...changed, ...scope.dataReaders]);
  const treeReaders = grepFiles(['-e', READS_THE_TREE, '--', '*.spec.ts']);
  if (listed === undefined || treeReaders === undefined) return undefined;
  return testFiles(listed, treeReaders);
}

const files = changedFiles();
const hasData = files?.some((file) => isFixture(file) || isSnapshot(file)) === true;
const deleted = hasData ? deletedFiles() : [];
let result: CiScope = ciScope({
  event: process.env.GITHUB_EVENT_NAME ?? 'local',
  files,
  readers: files === undefined ? undefined : readersOf(files),
  data: files === undefined || deleted === undefined ? undefined : dataReaders(files, deleted),
});
let related: string[] = [];
if (result.tests === 'related' && files !== undefined) {
  const found = await relatedTestFiles(files, result);
  // No list is no proof that few tests are affected: run them all.
  if (found === undefined || found.length === 0) {
    result = {
      ...result,
      tests: 'all',
      testsReason: 'the affected tests could not be listed',
      dataReaders: [],
    };
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
