/**
 * What a CI run has to check. Three answers, from the change alone:
 *
 * - `docs`: only documentation changed, by the pre-push hook's rule (`tools/pre-push/plan.ts`).
 *   Lint runs, and the tests of the code that reads the changed files.
 * - `code` with `tests: 'related'` (D637, D648): a PR that changes only TypeScript source
 *   inside packages, documentation, changesets, `.mmd` fixtures of the e2e corpus and vitest
 *   snapshots. Every job runs, but the unit shards run only the test files the change can
 *   reach (`testFiles`), as make rebuilds only what depends on a changed file: those the import
 *   graph finds from the changed source and from `dataReaders` (the specs that own a changed
 *   snapshot, and the code that reads the corpus when a fixture changed). `docs-tests` runs
 *   the tests of the code that reads the changed docs and changesets.
 * - `code` with `tests: 'all'`: everything, as before. Every doubt ends here, and so does every
 *   push to mermaid-v13, which is what catches a test a PR wrongly left out.
 *
 * Pure: the git and vitest work is in `scope-git.ts` and `scope-cli.ts`.
 */
import { isDocsPath } from '../pre-push/plan.ts';

export interface CiScope {
  /** `code`: every job runs. `docs`: lint, and the tests related to `readers` if there are any. */
  readonly scope: 'code' | 'docs';
  readonly reason: string;
  /**
   * The source files that name a changed docs file or read the changesets: `docs-tests` gives
   * them to `vitest related`, which runs the specs among them and the specs that import the
   * others. Empty when every test runs anyway.
   */
  readonly readers: readonly string[];
  /** What the unit shards run. `none` in a `docs` run, where `docs-tests` runs instead. */
  readonly tests: 'all' | 'related' | 'none';
  /** Why `tests` is what it is, for the job summary and the replay. */
  readonly testsReason: string;
  /**
   * In a `related` run, the files that read a changed fixture or snapshot (D648): the specs
   * that own a changed snapshot and, when a fixture changed, the code that names the corpus.
   * The unit shards run the specs among them and the specs that import the others, beside
   * those the changed source reaches. Empty otherwise.
   */
  readonly dataReaders: readonly string[];
}

const code = (reason: string): CiScope => ({
  scope: 'code',
  reason,
  readers: [],
  tests: 'all',
  testsReason: reason,
  dataReaders: [],
});

/**
 * TypeScript source of a package, specs included: what the import graph sees. A JSON file, a
 * manifest or a config is read from disk by tests that do not import it, so a change to one
 * runs every test. Fixtures and snapshots have their own rule (D648).
 */
const PACKAGE_SOURCE = /^packages\/[^/]+\/src\/.+\.ts$/;

/** A changeset: release input, read by the release tooling and its tests and by nothing else. */
const CHANGESET = /^\.changeset\/[^/]+\.md$/;

/**
 * A file that may sit beside package source in a `related` run: documentation or a changeset.
 * The tests that depend on one are those of the code that reads it (`readers`), which
 * `docs-tests` runs.
 */
export const isCompanion = (file: string): boolean => isDocsPath(file) || CHANGESET.test(file);

/** Whether `file` is a changeset. */
export const isChangeset = (file: string): boolean => CHANGESET.test(file);

/**
 * A fixture of the e2e corpus (D648). Only a `.mmd` file: a manifest, a JSON or a text file
 * beside it is read by rules that no search here finds, so it still runs every test.
 */
const FIXTURE = /^e2e\/diagrams\/.+\.mmd$/;

/** A vitest snapshot: a file in a `__snapshots__` folder inside a package's `src` (D648). */
const SNAPSHOT = /^packages\/[^/]+\/src\/(?:.+\/)?__snapshots__\/.+$/;

/** Whether `file` is a `.mmd` fixture of the e2e corpus. */
export const isFixture = (file: string): boolean => FIXTURE.test(file);

/** Whether `file` is a vitest snapshot inside a package's `src`. */
export const isSnapshot = (file: string): boolean => SNAPSHOT.test(file);

const SNAPSHOTS_FOLDER = '/__snapshots__/';

/**
 * Where to look for the spec that owns a snapshot. `<dir>/__snapshots__/<name>.spec.ts.snap`
 * is written by `<dir>/<name>.spec.ts` (`spec`). Any other file, `<dir>/__snapshots__/<name>`
 * or a file inside the folder `<dir>/__snapshots__/<name>/`, is a `toMatchFileSnapshot` file:
 * its owner is a spec under `<dir>` that names `<name>` (`dir`, `name`), found by searching.
 */
export function snapshotOwner(
  file: string
): { readonly spec: string } | { readonly dir: string; readonly name: string } {
  const at = file.lastIndexOf(SNAPSHOTS_FOLDER);
  const dir = file.slice(0, at);
  const rest = file.slice(at + SNAPSHOTS_FOLDER.length);
  const name = rest.split('/')[0] ?? rest;
  if (name === rest && rest.endsWith('.spec.ts.snap')) {
    return { spec: `${dir}/${rest.slice(0, -'.snap'.length)}` };
  }
  return { dir, name };
}

/** What a `related` run needs to know about the changed fixtures and snapshots (D648). */
export interface DataReaders {
  /** The specs that own each changed snapshot. A snapshot with no entry, or none, has no owner. */
  readonly owners: ReadonlyMap<string, readonly string[]>;
  /** The source files that name the e2e corpus, or undefined when that search failed. */
  readonly corpus: readonly string[] | undefined;
  /** The changed files that the change deletes or renames away. */
  readonly deleted: readonly string[];
}

type Found = { readonly readers: readonly string[] } | { readonly doubt: string };

/** The owners of the changed snapshots, or why every test runs. */
function snapshotReaders(snapshots: readonly string[], data: DataReaders): Found {
  const readers: string[] = [];
  for (const snapshot of snapshots) {
    // vitest reports an obsolete snapshot only when the spec that wrote it runs.
    if (data.deleted.includes(snapshot)) return { doubt: `a deleted snapshot: ${snapshot}` };
    const owners = data.owners.get(snapshot) ?? [];
    if (owners.length === 0) return { doubt: `no spec is found to own the snapshot: ${snapshot}` };
    readers.push(...owners);
  }
  return { readers };
}

/** The files whose tests the changed fixtures and snapshots need, or why every test runs. */
function dataReadersFor(files: readonly string[], data: DataReaders | undefined): Found {
  const fixtures = files.filter(isFixture);
  const snapshots = files.filter(isSnapshot);
  const first = fixtures[0] ?? snapshots[0];
  if (first === undefined) return { readers: [] };
  if (data === undefined) return { doubt: `the readers of fixtures are not known: ${first}` };
  const owners = snapshotReaders(snapshots, data);
  if ('doubt' in owners) return owners;
  const readers = new Set(owners.readers);
  if (fixtures.length > 0) {
    if (data.corpus === undefined || data.corpus.length === 0) {
      return { doubt: `the search for code that reads the corpus failed: ${first}` };
    }
    for (const reader of data.corpus) readers.add(reader);
  }
  return { readers: [...readers].sort() };
}

/** Whether a `related` run allows `file`: package source, a companion, a fixture or a snapshot. */
const allowed = (file: string): boolean =>
  PACKAGE_SOURCE.test(file) || isCompanion(file) || isFixture(file) || isSnapshot(file);

/** What the unit shards run for a change that is not docs-only, and whose readers to test. */
function testsFor(
  event: string,
  files: readonly string[],
  readers: readonly string[] | undefined,
  data: DataReaders | undefined
): Pick<CiScope, 'tests' | 'testsReason' | 'readers' | 'dataReaders'> {
  const all = (testsReason: string) => ({
    tests: 'all' as const,
    testsReason,
    readers: [],
    dataReaders: [],
  });
  if (event !== 'pull_request') return all(`a ${event} run runs every test`);
  const other = files.find((file) => !allowed(file));
  if (other !== undefined) {
    return all(`not package source, docs, a changeset, a fixture or a snapshot: ${other}`);
  }
  if (readers === undefined) return all('the search for code that reads the docs failed');
  const found = dataReadersFor(files, data);
  if ('doubt' in found) return all(found.doubt);
  return {
    tests: 'related',
    testsReason:
      found.readers.length === 0
        ? 'only package source, documentation and changesets changed'
        : 'only package source, documentation, changesets, fixtures and snapshots changed',
    readers: [...readers].sort(),
    dataReaders: found.readers,
  };
}

/** The events whose checkout has the change as `HEAD^1..HEAD`. */
const DIFFED_EVENTS = ['pull_request', 'push'];

/**
 * `files`: what the change touches. `readers`: the source files that name one of its docs
 * files (see `codeReferencePattern`) or read the changesets, or undefined when that search
 * failed. `data`: who reads its fixtures and snapshots, undefined when not known. Every doubt
 * ends in `code` with every test.
 */
export function ciScope(input: {
  readonly event: string;
  readonly files: readonly string[] | undefined;
  readonly readers: readonly string[] | undefined;
  readonly data?: DataReaders | undefined;
}): CiScope {
  const { event, files, readers, data } = input;
  if (!DIFFED_EVENTS.includes(event)) return code(`a ${event} run checks everything`);
  if (files === undefined || files.length === 0) return code('the changed files are not known');
  const notDocs = files.find((file) => !isDocsPath(file));
  if (notDocs !== undefined) {
    return { ...code(`not documentation: ${notDocs}`), ...testsFor(event, files, readers, data) };
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
    dataReaders: [],
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

/**
 * Code that names the e2e corpus (D648): the path `e2e/diagrams`, or a string literal of one
 * of its two segments, as `join(ROOT, 'e2e', 'diagrams')` and the explorer's `'e2e'` folder
 * do. `git grep -E` and JavaScript both read it. It errs towards running: `startsWith('e2e')`
 * matches too. When a fixture changes, the specs that match and the specs that import a file
 * that matches all run, whatever their diagram type: most readers walk every type's folder.
 */
export const NAMES_THE_CORPUS = 'e2e/diagrams|[\'"`](diagrams|e2e)[\'"`/]';

/** Where vitest finds its test files (`vitest.config.ts`): other specs are Playwright's. */
const VITEST_ROOTS = /^(packages|tools|e2e\/helpers)\//;

/**
 * The test files of a `related` run, sorted: those vitest finds affected by the change and
 * its data readers (`related`), and those that read the tree (`treeReaders`).
 */
export function testFiles(related: readonly string[], treeReaders: readonly string[]): string[] {
  return [...new Set([...related, ...treeReaders])]
    .filter((file) => VITEST_ROOTS.test(file) && file.endsWith('.spec.ts'))
    .sort();
}

/** The job summary (Markdown). `files` is how many test files a `related` run has. */
export function summarize(result: CiScope, files?: number): string {
  const lines = [`### CI scope: ${result.scope}`, '', result.reason];
  if (result.readers.length > 0) {
    lines.push('', 'The tests related to these run:', '');
    lines.push(...result.readers.map((reader) => `- \`${reader}\``));
  }
  if (result.dataReaders.length > 0) {
    const n = result.dataReaders.length;
    lines.push(
      '',
      `The unit shards run the tests related to ${n} readers of fixtures and snapshots.`
    );
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

/** A merged PR: its changed files, and who reads its fixtures and snapshots, if known. */
export interface ReplayPr {
  readonly files: readonly string[];
  readonly data?: DataReaders | undefined;
}

/** What the rules decide for each of `prs`: the retro's numbers. */
export function replay(prs: readonly ReplayPr[]): Replay {
  const counts = { docs: 0, related: 0, all: 0 };
  const because = new Map<string, number>();
  for (const { files, data } of prs) {
    const result = ciScope({ event: 'pull_request', files, readers: [], data });
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
