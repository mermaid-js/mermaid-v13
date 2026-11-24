import { describe, expect, it } from 'vitest';
import { kept, keptLeaf, type KeptLevel } from './kept.ts';

describe('kept theme parts', () => {
  it('finds one leaf per path of objects', () => {
    const root: KeptLevel<number> = new WeakMap();
    const [a, b] = [{}, {}];
    expect(keptLeaf(root, [a, b])).toBe(keptLeaf(root, [a, b]));
    expect(keptLeaf(root, [a, b])).not.toBe(keptLeaf(root, [b, a]));
    expect(keptLeaf(root, [a])).not.toBe(keptLeaf(root, [a, b]));
  });

  it('makes a value once per key, and says when it was kept', () => {
    const leaf = new Map<string, object>();
    let made = 0;
    const make = () => ({ n: ++made });
    const [x, hitX] = kept(leaf, 'k', make);
    const [y, hitY] = kept(leaf, 'k', make);
    expect(hitX).toBe(false);
    expect(hitY).toBe(true);
    expect(y).toBe(x);
    expect(made).toBe(1);
  });

  it('keeps the plain entry and the newest eight others, the oldest dropped first', () => {
    const leaf = new Map<string, number>();
    kept(leaf, '', () => -1);
    for (let n = 0; n < 8; n++) kept(leaf, `v${n}`, () => n);
    // A read makes v0 the newest; the next value then drops v1, the oldest.
    expect(kept(leaf, 'v0', () => 99)).toEqual([0, true]);
    kept(leaf, 'v8', () => 8);
    expect([...leaf.keys()].sort()).toEqual(['', 'v0', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8']);
    for (let n = 10; n < 40; n++) kept(leaf, `v${n}`, () => n);
    expect(leaf.has('')).toBe(true);
    expect(leaf.size).toBe(9);
  });
});
