/**
 * The Compare tab's version choice (#61): `12` is the newest stable 12.x, `latest` the
 * dist-tag, an exact version itself (offline too); the URL keeps the defaults out.
 */
import { describe, expect, it } from 'vitest';
import {
  compareSpeed,
  formatRenderMs,
  parseCompareUrlState,
  resolveVersion,
  serializeCompareUrlState,
  sortVersionsDesc,
  summarizeRenderTimes,
  type VersionsResponse,
} from './compare-model.ts';

const VERSIONS: VersionsResponse = {
  mermaid: {
    versions: sortVersionsDesc(['12.0.0', '13.0.0', '12.3.0-rc.1', '12.2.0', '11.17.2', '12.10.1']),
    distTags: { latest: '13.0.0' },
  },
  fetchedAt: 0,
  stale: false,
};

describe('resolveVersion', () => {
  it('resolves the v12 line to the newest stable 12.x', () => {
    expect(resolveVersion('12', VERSIONS)).toBe('12.10.1');
  });
  it('resolves latest from the dist-tags', () => {
    expect(resolveVersion('latest', VERSIONS)).toBe('13.0.0');
  });
  it('keeps an exact version, with or without the list', () => {
    expect(resolveVersion('11.17.2', VERSIONS)).toBe('11.17.2');
    expect(resolveVersion('12.0.0', undefined)).toBe('12.0.0');
    expect(resolveVersion('12', undefined)).toBeUndefined();
  });
});

describe('the URL state', () => {
  it('defaults to the v12 line with no diff, and ignores junk', () => {
    expect(parseCompareUrlState(new URLSearchParams('version=nope'))).toEqual({
      version: '12',
      diff: false,
    });
  });
  it('round-trips, leaving the defaults out', () => {
    const state = parseCompareUrlState(new URLSearchParams('version=12.1.0&diff=1'));
    expect(state).toEqual({ version: '12.1.0', diff: true });
    expect(serializeCompareUrlState(state)).toEqual({ version: '12.1.0', diff: '1' });
    expect(serializeCompareUrlState({ version: '12', diff: false })).toEqual({
      version: null,
      diff: null,
    });
  });
});

describe('render time chips', () => {
  it('formats a render time to a sensible precision', () => {
    expect(formatRenderMs(0.456)).toBe('0.46 ms');
    expect(formatRenderMs(37.57)).toBe('37.6 ms');
    expect(formatRenderMs(777.95)).toBe('778 ms');
    expect(formatRenderMs(3374.84)).toBe('3.37 s');
  });

  it('says how many times faster or slower a pane is than the other', () => {
    expect(compareSpeed(10, 25)).toEqual({ kind: 'faster', ratio: 2.5, label: '2.5× faster' });
    expect(compareSpeed(25, 10)).toEqual({ kind: 'slower', ratio: 2.5, label: '2.5× slower' });
    expect(compareSpeed(37.57, 777.95)?.label).toBe('21× faster');
  });

  it('calls times within 5% of each other the same speed', () => {
    expect(compareSpeed(10, 10.4)).toMatchObject({ kind: 'same', label: 'same speed' });
  });

  it('sums up a pane’s timed renders as their median, min and max', () => {
    expect(summarizeRenderTimes([4, 1, 5, 2, 3])).toEqual({ median: 3, min: 1, max: 5, runs: 5 });
    expect(summarizeRenderTimes([4, 1, 3, 2])).toEqual({ median: 2.5, min: 1, max: 4, runs: 4 });
    expect(summarizeRenderTimes([7])).toEqual({ median: 7, min: 7, max: 7, runs: 1 });
    expect(summarizeRenderTimes([2, Number.NaN, 1, Infinity, 3])?.median).toBe(2);
    expect(summarizeRenderTimes([])).toBeUndefined();
  });

  it('keeps one slow first render from setting the ratio (#358)', () => {
    // The shape from the issue, in relative units: each pane's first timed run is much slower
    // than the rest. Only the ratio is asserted.
    const v13 = summarizeRenderTimes([44, 1, 1.1, 0.9, 1])!;
    const v12 = summarizeRenderTimes([60, 35, 36, 34, 35])!;
    expect(compareSpeed(v13.median, v12.median)).toMatchObject({
      kind: 'faster',
      label: '35× faster',
    });
    // The first runs alone would have said 1.4× faster.
    expect(compareSpeed(44, 60)?.label).toBe('1.4× faster');
  });

  it('compares nothing without two positive times', () => {
    expect(compareSpeed(0, 10)).toBeUndefined();
    expect(compareSpeed(10, Number.NaN)).toBeUndefined();
  });
});
