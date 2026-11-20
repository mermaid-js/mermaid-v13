import { describe, expect, it } from 'vitest';
import {
  ciScope,
  isFixture,
  isSnapshot,
  NAMES_THE_CORPUS,
  READS_THE_TREE,
  replay,
  snapshotOwner,
  summarize,
  testFiles,
  type DataReaders,
} from './scope.ts';

const docs = ['v13/docs/DECISIONS.md'];

describe('ciScope', () => {
  it('checks everything when a changed file is not documentation', () => {
    const result = ciScope({
      event: 'pull_request',
      files: [...docs, 'packages/core/src/svg/writer.ts'],
      readers: [],
    });
    expect(result.scope).toBe('code');
    expect(result.reason).toContain('packages/core/src/svg/writer.ts');
  });

  it('counts Markdown that lives with code as code, as the pre-push hook does', () => {
    for (const file of [
      '.changeset/quiet-cats.md',
      'e2e/diagrams/flowchart/pr-check/readme.md',
      'packages/core/src/theme/notes.md',
      'v13/docs/tools/build.ts',
    ]) {
      expect(ciScope({ event: 'push', files: [file], readers: [] }).scope, file).toBe('code');
    }
  });

  it('is a docs run when every file is documentation that no code reads', () => {
    const result = ciScope({
      event: 'pull_request',
      files: ['README.md', 'docs/a.png'],
      readers: [],
    });
    expect(result).toMatchObject({ scope: 'docs', readers: [] });
    expect(result.reason).toContain('2 files changed');
  });

  it('names the code that reads a changed docs file, specs or not, sorted', () => {
    const result = ciScope({
      event: 'push',
      files: docs,
      readers: ['packages/dev/src/b.spec.ts', 'packages/conformance/src/allowlists/allowlists.ts'],
    });
    expect(result.scope).toBe('docs');
    expect(result.readers).toEqual([
      'packages/conformance/src/allowlists/allowlists.ts',
      'packages/dev/src/b.spec.ts',
    ]);
    expect(result.reason).toContain('2 source files read them');
  });

  it('checks everything on any doubt: another event, no file list, a failed search', () => {
    for (const event of ['merge_group', 'workflow_dispatch', 'schedule']) {
      expect(ciScope({ event, files: docs, readers: [] }).scope, event).toBe('code');
    }
    expect(ciScope({ event: 'push', files: undefined, readers: [] }).scope).toBe('code');
    expect(ciScope({ event: 'push', files: [], readers: [] }).scope).toBe('code');
    expect(ciScope({ event: 'push', files: docs, readers: undefined }).scope).toBe('code');
  });
});

describe('summarize', () => {
  it('names the scope, the reason and the specs', () => {
    const text = summarize(ciScope({ event: 'push', files: docs, readers: ['a/b.spec.ts'] }));
    expect(text).toContain('### CI scope: docs');
    expect(text).toContain('1 file changed');
    expect(text).toContain('- `a/b.spec.ts`');
  });
});

describe('which unit tests run (D637)', () => {
  const source = [
    'packages/diagram-pie/src/layout/metrics.ts',
    'packages/core/src/svg/writer.spec.ts',
  ];
  const on = (event: string, files: string[]) => ciScope({ event, files, readers: [] });

  it('runs the related tests on a PR that changes only TypeScript source of packages', () => {
    expect(on('pull_request', source)).toMatchObject({ scope: 'code', tests: 'related' });
  });

  it('stays related with docs and changesets beside the source, and names their readers', () => {
    const result = ciScope({
      event: 'pull_request',
      files: [...source, '.changeset/quiet-cats.md', 'v13/docs/MIGRATION.md', 'README.md'],
      readers: ['tools/release/src/changesets.ts', 'tools/gen-config/src/migration.spec.ts'],
    });
    expect(result).toMatchObject({ scope: 'code', tests: 'related' });
    expect(result.readers).toEqual([
      'tools/gen-config/src/migration.spec.ts',
      'tools/release/src/changesets.ts',
    ]);
  });

  it('runs every test, with no readers, when the search for readers failed', () => {
    const result = ciScope({
      event: 'pull_request',
      files: [...source, '.changeset/quiet-cats.md'],
      readers: undefined,
    });
    expect(result).toMatchObject({ scope: 'code', tests: 'all', readers: [] });
  });

  it('runs every test when any other file changed, and names it', () => {
    for (const file of [
      'packages/conformance/divergences/pie.json',
      'packages/diagram-pie/package.json',
      'e2e/diagrams/pie/pr-check/a.json',
      'e2e/diagrams/flowchart/hand-drawn.txt',
      'e2e/rendering/pie/a.mmd',
      'packages/diagram-pie/__snapshots__/a.spec.ts.snap',
      '.changeset/config.json',
      '.changeset/pre.json',
      'tools/ci/scope.ts',
      'pnpm-lock.yaml',
      'vitest.config.ts',
      '.github/workflows/ci.yml',
    ]) {
      const result = on('pull_request', [...source, 'README.md', file]);
      expect(result.tests, file).toBe('all');
      expect(result.testsReason, file).toContain(file);
      // Every test runs, so there is nothing left for docs-tests to add.
      expect(result.readers, file).toEqual([]);
    }
  });

  it('runs every test on a push, whatever changed: the push is the safety net', () => {
    expect(on('push', source)).toMatchObject({ scope: 'code', tests: 'all' });
    expect(on('merge_group', source).tests).toBe('all');
  });

  it('leaves the unit shards out of a docs run', () => {
    expect(on('pull_request', ['README.md'])).toMatchObject({ scope: 'docs', tests: 'none' });
  });

  it('joins the affected tests and the tree readers, without duplicates or Playwright specs', () => {
    expect(
      testFiles(
        ['packages/diagram-pie/src/a.spec.ts', 'tools/ci/scope.spec.ts'],
        [
          'tools/ci/scope.spec.ts',
          'e2e/helpers/util.spec.ts',
          'e2e/dev/explorer.spec.ts',
          'packages/x/src/y.ts',
        ]
      )
    ).toEqual([
      'e2e/helpers/util.spec.ts',
      'packages/diagram-pie/src/a.spec.ts',
      'tools/ci/scope.spec.ts',
    ]);
  });

  it('counts a spec as reading the tree when it scans a folder or names a path into src', () => {
    const reads = new RegExp(READS_THE_TREE);
    expect(reads.test('for (const name of readdirSync(dir)) {')).toBe(true);
    expect(reads.test("await globby('**/*.mmd')")).toBe(true);
    expect(reads.test("read('packages/core/src/index.ts')")).toBe(true);
    expect(reads.test("import { a } from './a.ts';")).toBe(false);
    expect(reads.test("expect(render('pie')).toBe(svg);")).toBe(false);
  });

  it('says in the summary what the unit shards run and why', () => {
    expect(summarize(on('pull_request', source), 271)).toContain(
      '**Unit tests: related, 271 test files.**'
    );
    expect(summarize(on('push', source))).toContain(
      '**Unit tests: all.** a push run runs every test.'
    );
    expect(summarize(on('pull_request', ['README.md']))).not.toContain('Unit tests');
  });
});

describe('fixtures and snapshots in a related run (D648)', () => {
  const source = ['packages/diagram-pie/src/layout/metrics.ts'];
  const fixture = 'e2e/diagrams/pie/pr-check/a.mmd';
  const fileSnapshot = 'packages/conformance/src/__snapshots__/pie-layout.spec.ts.snap';
  const folderSnapshot = 'packages/conformance/src/__snapshots__/yaml-tree/pie.txt';
  const corpus = ['packages/conformance/src/corpus.ts', 'packages/dev/src/fixtures.ts'];
  const data = (over: Partial<DataReaders> = {}): DataReaders => ({
    owners: new Map([
      [fileSnapshot, ['packages/conformance/src/pie-layout.spec.ts']],
      [folderSnapshot, ['packages/conformance/src/yaml-tree.spec.ts']],
    ]),
    corpus,
    deleted: [],
    ...over,
  });
  const on = (files: string[], over?: Partial<DataReaders>, event = 'pull_request') =>
    ciScope({ event, files, readers: [], data: data(over) });

  it('knows a fixture and a snapshot when it sees one', () => {
    expect(isFixture(fixture)).toBe(true);
    expect(isFixture('e2e/diagrams/pie/hand-drawn.txt')).toBe(false);
    expect(isFixture('dev-diagrams/pie/a.mmd')).toBe(false);
    expect(isSnapshot(fileSnapshot)).toBe(true);
    expect(isSnapshot(folderSnapshot)).toBe(true);
    expect(isSnapshot('packages/conformance/src/er/__snapshots__/er-errors.md')).toBe(true);
    expect(isSnapshot('packages/conformance/__snapshots__/a.snap')).toBe(false);
    expect(isSnapshot('e2e/__snapshots__/a.png')).toBe(false);
  });

  it('finds the owner of a snapshot by its name or by searching its folder', () => {
    expect(snapshotOwner(fileSnapshot)).toEqual({
      spec: 'packages/conformance/src/pie-layout.spec.ts',
    });
    expect(
      snapshotOwner('packages/conformance/src/state/__snapshots__/layout.spec.ts.snap')
    ).toEqual({ spec: 'packages/conformance/src/state/layout.spec.ts' });
    expect(snapshotOwner(folderSnapshot)).toEqual({
      dir: 'packages/conformance/src',
      name: 'yaml-tree',
    });
    expect(snapshotOwner('packages/conformance/src/railroad/__snapshots__/ascii/a/b.txt')).toEqual({
      dir: 'packages/conformance/src/railroad',
      name: 'ascii',
    });
    expect(snapshotOwner('packages/conformance/src/er/__snapshots__/er-errors.md')).toEqual({
      dir: 'packages/conformance/src/er',
      name: 'er-errors.md',
    });
  });

  it('runs the readers of the corpus when only a fixture changed', () => {
    expect(on([fixture])).toMatchObject({ scope: 'code', tests: 'related', dataReaders: corpus });
  });

  it('runs the owner of a snapshot when only a snapshot changed, not the corpus readers', () => {
    expect(on([folderSnapshot])).toMatchObject({
      tests: 'related',
      dataReaders: ['packages/conformance/src/yaml-tree.spec.ts'],
    });
  });

  it('joins the owners and the corpus readers beside source, docs and a changeset', () => {
    const result = on([...source, fixture, fileSnapshot, folderSnapshot, '.changeset/a.md']);
    expect(result.tests).toBe('related');
    expect(result.testsReason).toContain('fixtures and snapshots');
    expect(result.dataReaders).toEqual([
      'packages/conformance/src/corpus.ts',
      'packages/conformance/src/pie-layout.spec.ts',
      'packages/conformance/src/yaml-tree.spec.ts',
      'packages/dev/src/fixtures.ts',
    ]);
    expect(summarize(result, 300)).toContain('related to 4 readers of fixtures and snapshots');
  });

  it('keeps a source-only run as it was, with no data readers', () => {
    expect(on(source)).toMatchObject({ tests: 'related', dataReaders: [] });
    expect(on(source).testsReason).toBe(
      'only package source, documentation and changesets changed'
    );
  });

  it('runs every test for a snapshot no spec is found to own', () => {
    for (const owners of [new Map(), new Map([[fileSnapshot, []]])]) {
      const result = on([...source, fileSnapshot], { owners });
      expect(result).toMatchObject({ tests: 'all', dataReaders: [], readers: [] });
      expect(result.testsReason).toContain(`no spec is found to own the snapshot: ${fileSnapshot}`);
    }
  });

  it('runs every test for a deleted snapshot, whose obsolete entry only a full run reports', () => {
    const result = on([fileSnapshot], { deleted: [fileSnapshot] });
    expect(result).toMatchObject({ tests: 'all', dataReaders: [] });
    expect(result.testsReason).toBe(`a deleted snapshot: ${fileSnapshot}`);
  });

  it('runs every test when the search for corpus readers failed or found nothing', () => {
    for (const found of [undefined, []]) {
      expect(on([fixture], { corpus: found }).tests).toBe('all');
    }
    // A snapshot alone does not need the corpus search.
    expect(on([folderSnapshot], { corpus: undefined }).tests).toBe('related');
  });

  it('runs every test when the readers are not known at all', () => {
    const result = ciScope({ event: 'pull_request', files: [fixture], readers: [] });
    expect(result.tests).toBe('all');
    expect(result.testsReason).toContain(fixture);
  });

  it('runs every test for a fixture next to another data file', () => {
    for (const file of ['e2e/diagrams/pie/hand-drawn.txt', 'e2e/diagrams/pie/a.expected.json']) {
      const result = on([fixture, file]);
      expect(result.tests, file).toBe('all');
      expect(result.testsReason, file).toContain(file);
    }
  });

  it('runs every test on a push, fixtures or not', () => {
    expect(on([fixture, folderSnapshot], {}, 'push')).toMatchObject({
      tests: 'all',
      dataReaders: [],
    });
  });

  it('names the corpus as its readers do', () => {
    const names = new RegExp(NAMES_THE_CORPUS);
    expect(names.test("join(REPO_ROOT, 'e2e/diagrams/pie')")).toBe(true);
    expect(names.test("join(REPO, 'e2e', 'diagrams')")).toBe(true);
    expect(names.test("['dev-diagrams', 'e2e']")).toBe(true);
    expect(names.test("join(ROOT, 'dev-diagrams', 'pie')")).toBe(false);
    expect(names.test("render('e2e-like')")).toBe(false);
  });
});

describe('replay', () => {
  it('counts docs, related and all, and what sent a PR to all', () => {
    const known = { owners: new Map(), corpus: ['packages/dev/src/fixtures.ts'], deleted: [] };
    const result = replay([
      { files: ['README.md'] },
      { files: ['packages/diagram-pie/src/a.ts'] },
      { files: ['packages/diagram-pie/src/a.ts', '.changeset/x.md'] },
      { files: ['e2e/diagrams/pie/pr-check/a.mmd', 'packages/diagram-pie/src/a.ts'] },
      { files: ['e2e/diagrams/er/pr-check/b.mmd'], data: known },
      { files: ['e2e/diagrams/er/pr-check/b.json'], data: known },
    ]);
    expect(result).toMatchObject({ total: 6, docs: 1, related: 3, all: 2 });
    expect(result.allBecause).toEqual([['e2e/diagrams', 2]]);
  });
});
