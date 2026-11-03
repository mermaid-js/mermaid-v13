/**
 * The Compare tab's version choice (#61): `12` is the newest stable 12.x, `latest` the
 * dist-tag, an exact version itself (offline too); the URL keeps the defaults out.
 */
import { describe, expect, it } from 'vitest';
import {
  parseCompareUrlState,
  resolveVersion,
  serializeCompareUrlState,
  sortVersionsDesc,
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
