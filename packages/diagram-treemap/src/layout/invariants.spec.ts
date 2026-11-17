import { beforeAll, describe, expect, it } from 'vitest';
import { tableMeasurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { treemapTestTheme } from '../test-context.ts';
import { context, leaf, model, section } from './fixtures.ts';
import { layoutTreemap, type TreemapLayout } from './index.ts';
import { treemapLayoutViolations } from './invariants.ts';

let theme: Theme;
beforeAll(async () => {
  theme = await treemapTestTheme();
});

const M = model([
  section('A', leaf('a1', 30), leaf('a2', 10), section('B', leaf('b1', 5), leaf('b2', 0))),
  leaf('c', 20),
]);
const ok = (): TreemapLayout => layoutTreemap(M, context(theme, {}, tableMeasurer));
const broken = (f: (l: TreemapLayout) => TreemapLayout): string[] =>
  treemapLayoutViolations(M, f(ok()));
const moveLeaf = (
  l: TreemapLayout,
  name: string,
  by: Partial<{ x: number; y: number; width: number }>
) => ({
  ...l,
  leaves: l.leaves.map((x) => (x.node.name === name ? { ...x, box: { ...x.box, ...by } } : x)),
});

describe('treemapLayoutViolations', () => {
  it('passes a sound layout', () => {
    expect(treemapLayoutViolations(M, ok())).toEqual([]);
  });

  it('catches a NaN', () => {
    expect(broken((l) => ({ ...l, width: Number.NaN }))).toContain('layout.width is NaN');
  });

  it('catches a row drawn twice or not at all', () => {
    expect(
      broken((l) => ({ ...l, leaves: l.leaves.slice(1) })).some((v) => v.includes('not drawn'))
    ).toBe(true);
    expect(
      broken((l) => ({ ...l, leaves: [...l.leaves, l.leaves[0]!] })).some((v) =>
        v.includes('twice')
      )
    ).toBe(true);
  });

  it('catches a child outside its padded box, and overlapping siblings', () => {
    const c = ok().leaves.find((x) => x.node.name === 'c')!;
    const v = broken((l) => moveLeaf(l, 'a1', { x: c.box.x }));
    expect(v.some((x) => x.includes('outside node:A@'))).toBe(true);
    const a2 = ok().leaves.find((x) => x.node.name === 'a2')!;
    expect(
      broken((l) => moveLeaf(l, 'a1', { x: a2.box.x, y: a2.box.y })).some((x) =>
        x.includes('overlaps')
      )
    ).toBe(true);
  });

  it('catches an area out of proportion, and a zero value with area', () => {
    const a1 = ok().leaves.find((x) => x.node.name === 'a1')!;
    expect(
      broken((l) => moveLeaf(l, 'a1', { width: a1.box.width / 2 })).some((x) => x.includes('share'))
    ).toBe(true);
    expect(broken((l) => moveLeaf(l, 'b2', { width: 5 })).some((x) => x.includes('no value'))).toBe(
      true
    );
  });

  it('catches a label outside its box, and something outside the bounds', () => {
    const v = broken((l) => ({
      ...l,
      leaves: l.leaves.map((x) =>
        x.label
          ? { ...x, label: { ...x.label, box: { ...x.label.box, width: x.box.width * 2 } } }
          : x
      ),
    }));
    expect(v.some((x) => x.includes('label'))).toBe(true);
    expect(
      broken((l) => ({ ...l, bounds: { ...l.bounds, width: 10 } })).some((x) =>
        x.includes('bounds')
      )
    ).toBe(true);
  });
});
