import { describe, expect, it } from 'vitest';
import { compareIdentity, identityReport } from './identity.ts';

describe('compareIdentity', () => {
  it('counts a fixture identical when both renderers give the same SVG string', () => {
    const result = compareIdentity([
      { id: 'corpus/a', head: { svg: '<svg id="i0"/>' }, base: { svg: '<svg id="i0"/>' } },
    ]);
    expect(result).toEqual({ compared: 1, failedInBoth: 0, differing: [] });
  });

  it('names a fixture whose SVG differs by one character, with where it first differs', () => {
    const result = compareIdentity([
      { id: 'corpus/a', head: { svg: '<svg/>' }, base: { svg: '<svg/>' } },
      { id: 'pele/b', head: { svg: '<svg width="10"/>' }, base: { svg: '<svg width="11"/>' } },
    ]);
    expect(result).toEqual({
      compared: 2,
      failedInBoth: 0,
      differing: [{ id: 'pele/b', reason: 'SVG differs at offset 13' }],
    });
  });

  it('counts a fixture that fails in both identical only when the error text is the same', () => {
    const parse = { error: 'Error: Parse error on line 2' };
    const result = compareIdentity([
      { id: 'same', head: parse, base: parse },
      { id: 'other', head: parse, base: { error: 'Error: Parse error on line 3' } },
    ]);
    expect(result.failedInBoth).toBe(1);
    expect(result.differing).toEqual([
      {
        id: 'other',
        reason:
          'errors differ: "Error: Parse error on line 2" (head), "Error: Parse error on line 3" (base)',
      },
    ]);
  });

  it('names a fixture that fails in only one renderer, with the error', () => {
    const result = compareIdentity([
      { id: 'head-fails', head: { error: 'TypeError: x is undefined' }, base: { svg: '<svg/>' } },
      { id: 'base-fails', head: { svg: '<svg/>' }, base: { error: 'RangeError: too deep' } },
    ]);
    expect(result.differing).toEqual([
      { id: 'head-fails', reason: 'head failed: TypeError: x is undefined' },
      { id: 'base-fails', reason: 'base failed: RangeError: too deep' },
    ]);
  });

  it('never counts a render that timed out as identical, even when both did', () => {
    const result = compareIdentity([
      { id: 'perf/huge1', head: { timeout: 30_000 }, base: { timeout: 30_000 } },
      { id: 'perf/large1', head: { svg: '<svg/>' }, base: { timeout: 30_000 } },
    ]);
    expect(result.differing).toEqual([
      { id: 'perf/huge1', reason: 'head timed out after 30000 ms' },
      { id: 'perf/large1', reason: 'base timed out after 30000 ms' },
    ]);
  });
});

describe('identityReport', () => {
  it('reports the count compared in one line when every fixture is identical', () => {
    expect(identityReport({ compared: 163, failedInBoth: 0, differing: [] })).toEqual({
      lines: ['Identity: 163 of 163 identical'],
      exitCode: 0,
    });
  });

  it('names every differing fixture with its reason and fails', () => {
    const report = identityReport({
      compared: 163,
      failedInBoth: 0,
      differing: [
        { id: 'corpus/basic/edges', reason: 'SVG differs at offset 812' },
        { id: 'pele/flowchart-500', reason: 'head failed: TypeError: x is undefined' },
      ],
    });
    expect(report).toEqual({
      lines: [
        'Identity: 161 of 163 identical; 2 differ:',
        '  corpus/basic/edges: SVG differs at offset 812',
        '  pele/flowchart-500: head failed: TypeError: x is undefined',
      ],
      exitCode: 1,
    });
  });

  it('fails when nothing was compared: an empty run proves nothing', () => {
    expect(identityReport({ compared: 0, failedInBoth: 0, differing: [] })).toEqual({
      lines: ['Identity: no fixtures compared'],
      exitCode: 1,
    });
  });

  it('says how many of the identical fixtures failed in both, so an all-error run shows', () => {
    expect(identityReport({ compared: 163, failedInBoth: 163, differing: [] }).lines).toEqual([
      'Identity: 163 of 163 identical (163 fail in both with the same error)',
    ]);
  });
});
