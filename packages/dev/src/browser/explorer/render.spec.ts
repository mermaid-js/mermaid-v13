/**
 * The dev-build cache behind `loadMermaid`: each build is imported once, and only the current
 * and the previous build stay in memory (a rebuild-heavy session would otherwise keep every
 * build's module and instance).
 */
import { describe, expect, it } from 'vitest';
import { createBuildCache } from './render.ts';

const counting = () => {
  const loads: number[] = [];
  const cache = createBuildCache(async (build: number) => {
    loads.push(build);
    return { build };
  });
  return { loads, cache };
};

describe('createBuildCache', () => {
  it('imports a build once', async () => {
    const { loads, cache } = counting();
    await cache.get(0);
    await cache.get(0);
    expect(loads).toEqual([0]);
  });

  it('keeps only the current and the previous build', async () => {
    const { loads, cache } = counting();
    for (const build of [0, 1, 2]) await cache.get(build);
    await cache.get(1);
    await cache.get(2);
    expect(loads).toEqual([0, 1, 2]);
    expect(cache.builds()).toEqual([1, 2]);
    await cache.get(0);
    expect(loads).toEqual([0, 1, 2, 0]);
  });

  it('forgets a build that failed to load', async () => {
    let fail = true;
    const cache = createBuildCache(async (build: number) => {
      if (fail) throw new Error('boom');
      return { build };
    });
    await expect(cache.get(3)).rejects.toThrow('boom');
    fail = false;
    await expect(cache.get(3)).resolves.toEqual({ build: 3 });
  });
});
