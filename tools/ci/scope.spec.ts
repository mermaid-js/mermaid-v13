import { describe, expect, it } from 'vitest';
import { ciScope, listedFile, READS_THE_TREE, replay, summarize, testFiles } from './scope.ts';

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
      'packages/diagram-pie/src/__snapshots__/a.spec.ts.snap',
      'e2e/diagrams/pie/pr-check/a.mmd',
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

  it('reads a line of vitest list as its path', () => {
    expect(listedFile('[workspace] tools/ci/scope.spec.ts')).toBe('tools/ci/scope.spec.ts');
    expect(listedFile('[gantt-la] packages/diagram-gantt/src/a.spec.ts ')).toBe(
      'packages/diagram-gantt/src/a.spec.ts'
    );
    expect(listedFile('tools/ci/scope.spec.ts')).toBe('tools/ci/scope.spec.ts');
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

describe('replay', () => {
  it('counts docs, related and all, and what sent a PR to all', () => {
    const result = replay([
      ['README.md'],
      ['packages/diagram-pie/src/a.ts'],
      ['packages/diagram-pie/src/a.ts', '.changeset/x.md'],
      ['e2e/diagrams/pie/pr-check/a.mmd', 'packages/diagram-pie/src/a.ts'],
      ['e2e/diagrams/er/pr-check/b.mmd'],
    ]);
    expect(result).toMatchObject({ total: 5, docs: 1, related: 2, all: 2 });
    expect(result.allBecause).toEqual([['e2e/diagrams', 2]]);
  });
});
