/**
 * What a CI run has to check. Three answers, from the change alone:
 *
 * - `docs`: only documentation changed, by the pre-push hook's rule (`tools/pre-push/plan.ts`).
 *   Lint runs, and the tests of the code that reads the changed files.
 * - `code` with `tests: 'related'` (D637): a PR that changes only TypeScript source inside
 *   packages. Every job runs, but the unit shards run only the test files the change can reach
 *   (`testFiles`), as make rebuilds only what depends on a changed file.
 * - `code` with `tests: 'all'`: everything, as before. Every doubt ends here, and so does every
 *   push to mermaid-v13, which is what catches a test a PR wrongly left out.
 *
 * Pure: the git and vitest work is in `scope-cli.ts`.
 */
import { isDocsPath } from '../pre-push/plan.ts';

export interface CiScope {
  /** `code`: every job runs. `docs`: lint, and the tests related to `readers` if there are any. */
  readonly scope: 'code' | 'docs';
  readonly reason: string;
  /**
   * The source files that name a changed docs file: a `docs` run gives them to
   * `vitest related`, which runs the specs among them and the specs that import the others.
   */
  readonly readers: readonly string[];
  /** What the unit shards run. `none` in a `docs` run, where `docs-tests` runs instead. */
  readonly tests: 'all' | 'related' | 'none';
  /** Why `tests` is what it is, for the job summary and the replay. */
  readonly testsReason: string;
}

const code = (reason: string): CiScope => ({
  scope: 'code',
  reason,
  readers: [],
  tests: 'all',
  testsReason: reason,
});

/**
 * TypeScript source of a package, specs included: what the import graph sees. A fixture, a
 * JSON file, a snapshot, a manifest or a config is read from disk by tests that do not import
 * it, so a change to one runs every test.
 */
const PACKAGE_SOURCE = /^packages\/[^/]+\/src\/.+\.ts$/;

/** What the unit shards run for a change that is not docs-only. */
function testsFor(event: string, files: readonly string[]): Pick<CiScope, 'tests' | 'testsReason'> {
  if (event !== 'pull_request') {
    return { tests: 'all', testsReason: `a ${event} run runs every test` };
  }
  const other = files.find((file) => !PACKAGE_SOURCE.test(file));
  if (other !== undefined) {
    return { tests: 'all', testsReason: `not TypeScript source of a package: ${other}` };
  }
  return { tests: 'related', testsReason: 'only TypeScript source of packages changed' };
}

/** The events whose checkout has the change as `HEAD^1..HEAD`. */
const DIFFED_EVENTS = ['pull_request', 'push'];

/**
 * `files`: what the change touches. `readers`: the source files that name one of them (see
 * `codeReferencePattern`), or undefined when that search failed. Every doubt ends in `code`.
 */
export function ciScope(input: {
  readonly event: string;
  readonly files: readonly string[] | undefined;
  readonly readers: readonly string[] | undefined;
}): CiScope {
  const { event, files, readers } = input;
  if (!DIFFED_EVENTS.includes(event)) return code(`a ${event} run checks everything`);
  if (files === undefined || files.length === 0) return code('the changed files are not known');
  const notDocs = files.find((file) => !isDocsPath(file));
  if (notDocs !== undefined) {
    return { ...code(`not documentation: ${notDocs}`), ...testsFor(event, files) };
  }
  if (readers === undefined) return code('the search for code that reads the docs failed');
  const count = `${files.length} ${files.length === 1 ? 'file' : 'files'}`;
  return {
    scope: 'docs',
    reason:
      readers.length === 0
        ? `${count} changed, all documentation that no code reads`
        : `${count} changed, all documentation; ${readers.length} source files read them`,
    readers: [...readers].sort(),
    tests: 'none',
    testsReason: 'a docs run has its own tests job',
  };
}

/**
 * A spec that reaches files without importing them: it scans a folder (`readdirSync`, a glob)
 * or names a path into a `src` tree, so it may read source as text. `git grep -E` and
 * JavaScript both read this pattern. A `related` run always includes these, since the import
 * graph cannot tell when one of them is affected. It errs towards running: a spec that only
 * imports from `../src/x.ts` matches too.
 */
export const READS_THE_TREE = 'readdirSync|globby|glob\\(|src/[^\'"`]*\\.ts[\'"`]';

/** Where vitest finds its test files (`vitest.config.ts`): other specs are Playwright's. */
const VITEST_ROOTS = /^(packages|tools|e2e\/helpers)\//;

/**
 * The test files of a `related` run, sorted: those vitest finds affected by the change
 * (`related`) and those that read the tree (`treeReaders`).
 */
export function testFiles(related: readonly string[], treeReaders: readonly string[]): string[] {
  return [...new Set([...related, ...treeReaders])]
    .filter((file) => VITEST_ROOTS.test(file) && file.endsWith('.spec.ts'))
    .sort();
}

/** A line of `vitest list --filesOnly`, `[project] path`, as its path. */
export const listedFile = (line: string): string => line.replace(/^\[[^\]]*\]\s*/, '').trim();

/** The job summary (Markdown). `files` is how many test files a `related` run has. */
export function summarize(result: CiScope, files?: number): string {
  const lines = [`### CI scope: ${result.scope}`, '', result.reason];
  if (result.readers.length > 0) {
    lines.push('', 'The tests related to these run:', '');
    lines.push(...result.readers.map((reader) => `- \`${reader}\``));
  }
  if (result.scope === 'code') {
    const count = files === undefined ? '' : `, ${files} test files`;
    lines.push('', `**Unit tests: ${result.tests}${count}.** ${result.testsReason}.`);
  }
  return `${lines.join('\n')}\n`;
}

export interface Replay {
  readonly total: number;
  readonly docs: number;
  readonly related: number;
  readonly all: number;
  /** The file that sent a PR to `all`, grouped by its first two path segments; most frequent first. */
  readonly allBecause: readonly (readonly [area: string, prs: number])[];
}

/** What the rules decide for each of `prs` (their changed files): the retro's numbers. */
export function replay(prs: readonly (readonly string[])[]): Replay {
  const counts = { docs: 0, related: 0, all: 0 };
  const because = new Map<string, number>();
  for (const files of prs) {
    const result = ciScope({ event: 'pull_request', files, readers: [] });
    if (result.scope === 'docs') counts.docs += 1;
    else if (result.tests === 'related') counts.related += 1;
    else {
      counts.all += 1;
      const file = result.testsReason.slice(result.testsReason.indexOf(': ') + 2);
      const area = file.split('/').slice(0, 2).join('/');
      because.set(area, (because.get(area) ?? 0) + 1);
    }
  }
  const allBecause = [...because].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  return { total: prs.length, ...counts, allBecause };
}
