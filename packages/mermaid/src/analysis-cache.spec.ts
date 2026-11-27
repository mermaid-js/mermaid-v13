import { describe, expect, it } from 'vitest';
import { AnalysisCache } from './analysis-cache.ts';
import type { Snapshot } from './config-snapshot.ts';

const snap = {} as Snapshot;

describe('AnalysisCache', () => {
  it('forgets every text on clear and caches again after it', () => {
    const cache = new AnalysisCache<number>();
    cache.set('a', snap, 1);
    cache.set('b', snap, 2);
    cache.clear();
    expect(cache.get('a', snap)).toBeUndefined();
    expect(cache.get('b', snap)).toBeUndefined();
    cache.set('a', snap, 3);
    expect(cache.get('a', snap)).toBe(3);
    expect(cache.get('a', {} as Snapshot)).toBeUndefined();
  });

  it('keeps the 32 most recently set texts, before and after a clear', () => {
    const cache = new AnalysisCache<number>();
    for (const round of [0, 1]) {
      for (let i = 0; i < 33; i++) cache.set(`t${i}`, snap, i);
      cache.set('t1', snap, 1); // set again: now the most recent
      cache.set('t33', snap, 33);
      expect(cache.get('t0', snap), `round ${round}`).toBeUndefined();
      expect(cache.get('t2', snap), `round ${round}`).toBeUndefined();
      expect(cache.get('t1', snap), `round ${round}`).toBe(1);
      expect(cache.get('t3', snap), `round ${round}`).toBe(3);
      cache.clear();
      expect(cache.get('t33', snap)).toBeUndefined();
    }
  });
});
