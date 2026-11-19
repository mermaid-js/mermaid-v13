import { describe, expect, it } from 'vitest';
import {
  changedFixtures,
  classifyPaths,
  decideFromHashes,
  decideWithoutHashes,
  fullAfterFailure,
  replayPaths,
  summarize,
} from './visual-scope.ts';

describe('classifyPaths', () => {
  it('compares when rendering code changed, whichever package it is in', () => {
    for (const file of [
      'packages/diagram-flowchart/src/render/shapes.ts',
      'packages/core/src/layout/layered/rank.ts',
      'packages/shared/src/svg/graph.ts',
      'packages/layout-elk/src/index.ts',
      'packages/plugin-hand-drawn/src/index.ts',
      'packages/mermaid/src/api.ts',
      'pnpm-lock.yaml',
      'e2e/diagrams/flowchart/pr-check/new.mmd',
    ]) {
      expect(classifyPaths([file]).kind, file).toBe('compare');
    }
  });

  it('runs everything when code the Node comparison cannot see changed', () => {
    for (const file of [
      'packages/dev/src/browser/viewer.ts',
      'packages/dev/src/adapter.ts',
      'e2e/helpers/util.ts',
      'e2e/rendering/mmd-snapshots.spec.ts',
      'playwright.config.ts',
      'package.json',
      'packages/mermaid/src/dom.ts',
      '.github/workflows/ci.yml',
      '.github/scripts/argos-upload.sh',
    ]) {
      const verdict = classifyPaths(['packages/diagram-pie/src/render.ts', file]);
      expect(verdict.kind, file).toBe('full');
      expect(verdict.reason).toContain(file);
    }
  });

  it('skips when every file is prose, a test or a package the render does not use', () => {
    const files = [
      'v13/docs/DECISIONS.md',
      'README.md',
      '.changeset/quiet-cats.md',
      'packages/diagram-pie/src/render.spec.ts',
      'packages/dev/src/gallery.spec.ts',
      'e2e/helpers/util.spec.ts',
      'packages/conformance/src/pie/suite.ts',
      'packages/bench/src/pr-check.ts',
      'packages/language-service/src/index.ts',
      'tools/release/src/publish.ts',
    ];
    expect(classifyPaths(files).kind).toBe('skip');
    expect(classifyPaths([...files, 'packages/core/src/theme/base.ts']).kind).toBe('compare');
  });

  it('compares when it is told of no files at all', () => {
    expect(classifyPaths([]).kind).toBe('compare');
  });
});

describe('changedFixtures', () => {
  it('lists fixtures that are new or render differently, and not removed ones', () => {
    const base = {
      'pie/pr-check/a.mmd': '1',
      'pie/pr-check/b.mmd': '2',
      'pie/pr-check/gone.mmd': '3',
    };
    const head = {
      'pie/pr-check/b.mmd': 'changed',
      'pie/pr-check/a.mmd': '1',
      'pie/baseline/new.mmd': '4',
    };
    expect(changedFixtures(base, head)).toEqual(['pie/baseline/new.mmd', 'pie/pr-check/b.mmd']);
  });
});

describe('decideFromHashes', () => {
  const tiers = ['pr-check', 'baseline'];

  it('photographs the changed fixtures of this run’s tiers and leaves the rest to the nightly', () => {
    const decision = decideFromHashes(
      ['pie/pr-check/a.mmd', 'pie/nightly-check/b.mmd', 'er-diagram/baseline/themes/c.mmd'],
      tiers
    );
    expect(decision.mode).toBe('subset');
    expect(decision.photograph).toEqual(['pie/pr-check/a.mmd', 'er-diagram/baseline/themes/c.mmd']);
    expect(decision.nightly).toEqual(['pie/nightly-check/b.mmd']);
  });

  it('skips when nothing of this run’s tiers changed, and still reports the nightly tiers', () => {
    expect(decideFromHashes([], tiers).mode).toBe('skip');
    const decision = decideFromHashes(['pie/visual-check/a.mmd'], tiers);
    expect(decision.mode).toBe('skip');
    expect(decision.nightly).toEqual(['pie/visual-check/a.mmd']);
  });
});

describe('decideWithoutHashes', () => {
  const rendering = ['packages/core/src/svg/writer.ts'];

  it('photographs everything outside a pull request: that run is the baseline', () => {
    for (const event of ['push', 'workflow_dispatch', 'merge_group']) {
      expect(decideWithoutHashes({ event, forceFull: false, files: [] })?.mode, event).toBe('full');
    }
  });

  it('photographs everything on a PR with the label', () => {
    const decision = decideWithoutHashes({
      event: 'pull_request',
      forceFull: true,
      files: ['a.md'],
    });
    expect(decision?.mode).toBe('full');
    expect(decision?.reason).toContain('visual: full');
  });

  it('follows the paths, and leaves rendering changes to the hashes', () => {
    const on = (files: string[]) =>
      decideWithoutHashes({ event: 'pull_request', forceFull: false, files });
    expect(on(['playwright.config.ts'])?.mode).toBe('full');
    expect(on(['README.md'])?.mode).toBe('skip');
    expect(on(rendering)).toBeUndefined();
  });
});

describe('the fail-safe and the summary', () => {
  it('photographs everything when the comparison fails, and says why', () => {
    const decision = fullAfterFailure(new Error('pnpm install failed'));
    expect(decision.mode).toBe('full');
    expect(decision.reason).toContain('pnpm install failed');
  });

  it('names the mode, the reason and the fixtures by folder', () => {
    const text = summarize(
      decideFromHashes(
        ['pie/pr-check/a.mmd', 'pie/pr-check/b.mmd', 'gantt/nightly-check/c.mmd'],
        ['pr-check']
      )
    );
    expect(text).toContain('### Visual scope: subset');
    expect(text).toContain('**Photographed (pie 2):**');
    expect(text).toContain('- `pie/pr-check/a.mmd`');
    expect(text).toContain('only the nightly photographs (gantt 1)');
  });

  it('cuts a long list short and says how many more there are', () => {
    const many = Array.from(
      { length: 45 },
      (_, i) => `pie/pr-check/f${String(i).padStart(2, '0')}.mmd`
    );
    const text = summarize(decideFromHashes(many, ['pr-check']));
    expect(text).toContain('- and 5 more');
    expect(text).not.toContain('f44.mmd');
  });
});

describe('replayPaths', () => {
  it('counts what the path rules decide and which files forced a full run', () => {
    const replay = replayPaths([
      ['packages/core/src/svg/writer.ts'],
      ['README.md'],
      ['packages/dev/src/adapter.ts', 'packages/core/src/svg/writer.ts'],
      ['packages/dev/src/adapter.ts'],
      ['playwright.config.ts'],
    ]);
    expect(replay).toMatchObject({ total: 5, full: 3, compare: 1, skip: 1 });
    expect(replay.fullBecause).toEqual([
      ['packages/dev/src/adapter.ts', 2],
      ['playwright.config.ts', 1],
    ]);
  });
});
