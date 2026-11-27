import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { Theme } from '@mermaid-js/core/theme';
import { VENN_ZERO_SET } from '../codes.ts';
import { vennTestContext, vennTestTheme } from '../test-context.ts';
import { vennLayoutViolations } from './invariants.ts';
import { layoutVenn } from './layout.ts';
import { fixture, gridMeasurer } from './mmd.fixtures.ts';
import { overlaps } from './geometry.ts';
import type {
  PlacedLabel,
  VennAreaLayout,
  VennCircle,
  VennLayout,
  VennSetLayout,
  VennTextArea,
} from './types.ts';

let theme: Theme;
beforeAll(async () => {
  theme = await vennTestTheme();
});

/**
 * The layout of the fixture at `path` (under `e2e/diagrams/venn/`) with its front-matter
 * config, the warnings of the layout, and the invariants checked.
 */
function laid(path: string): { layout: VennLayout; warnings: Warning[] } {
  const { model, config } = fixture(path);
  const warnings: Warning[] = [];
  const layout = layoutVenn(model, vennTestContext(theme, config, warnings, gridMeasurer));
  expect(vennLayoutViolations(model, layout)).toEqual([]);
  return { layout, warnings };
}

const circleOf = (layout: VennLayout, id: string): VennCircle =>
  layout.areas.find((a) => a.kind === 'set' && a.sets[0] === id)!.circle!;

const textOf = (label: { text: { lines: { text: string }[][] } } | undefined): string[] =>
  label!.text.lines.map((l) => l.map((r) => r.text).join(''));

/** `area`, which a spec knows to be a set. */
function setArea(area: VennAreaLayout | undefined): VennSetLayout {
  if (area?.kind !== 'set') throw new Error('not a set');
  return area;
}

const LAYOUT = 'nightly-check/layout';

/** The placed label of the area of `sets`. */
const labelOf = (layout: VennLayout, sets: readonly string[]): PlacedLabel =>
  layout.areas.find((a) => a.sets.join('+') === sets.join('+'))!.label!;

/** Every corner of every cell of `t` inside its inner circle. */
function expectCellsInside(t: VennTextArea): void {
  const { x, y, radius } = t.inner;
  for (const { cell } of t.nodes) {
    for (const cx of [cell.x, cell.x + cell.width]) {
      for (const cy of [cell.y, cell.y + cell.height]) {
        expect(Math.hypot(cx - x, cy - y)).toBeLessThanOrEqual(radius + 1e-9);
      }
    }
  }
}

describe('venn layout: the solve (D411, D412)', () => {
  it('draws three equal sets as an equilateral triangle, d / r ≈ 1.2632, C on top', () => {
    const { layout } = laid('pr-check/2-should-render-a-three-set-venn-diagram');
    const [a, b, c] = ['A', 'B', 'C'].map((id) => circleOf(layout, id));
    const d = (p: VennCircle, q: VennCircle) => Math.hypot(p.x - q.x, p.y - q.y);
    expect(a!.radius).toBeCloseTo(b!.radius, 9);
    expect(a!.radius).toBeCloseTo(c!.radius, 9);
    for (const [p, q] of [
      [a, b],
      [a, c],
      [b, c],
    ] as const) {
      expect(d(p!, q!) / a!.radius).toBeCloseTo(1.2632, 3);
    }
    expect(c!.y).toBeLessThan(Math.min(a!.y, b!.y));
  });

  it("gives two equal sets v12's drawn radius of 210 at the default 800 × 450 and padding 15", () => {
    const { layout } = laid('pr-check/1-should-render-a-simple-two-set-venn-diagram');
    expect(layout.padding).toBe(15);
    expect(circleOf(layout, 'A').radius).toBeCloseTo(210, 6);
    expect(circleOf(layout, 'B').radius).toBeCloseTo(210, 6);
  });

  it('draws one set alone as large as the chart allows', () => {
    const { layout } = laid(`${LAYOUT}/one-set`);
    expect(circleOf(layout, 'A').radius).toBeCloseTo(210, 6);
  });
});

describe('venn layout: input v12 drew badly or not at all (D417)', () => {
  it('draws an empty diagram as its title only', () => {
    const { layout } = laid('nightly-check/empty-with-title');
    expect(layout.areas).toEqual([]);
    expect(layout.title?.text.lines.length).toBe(1);
    // Centred on (width / 2, 32s), at 32 px whatever the scale.
    expect(layout.title!.x + layout.title!.width / 2).toBe(400);
    expect(layout.title!.y + layout.title!.height / 2).toBe(16);
    expect(layout.fonts.title.size).toBe(32);
    expect(layout.titleHeight).toBe(24);
    expect(layout.offset).toEqual({ x: 0, y: 24 });
  });

  it('drops a set of size 0 and every overlap with it, with one VENN_ZERO_SET naming it', () => {
    // set Z:0 and set N:-2 beside A and B; N is the parser's VENN_INVALID_SIZE, not a zero set.
    const { layout, warnings } = laid('nightly-check/zero-and-negative-sizes');
    expect(layout.areas.map((a) => a.sets.join('+'))).toEqual(['A', 'B', 'A+B']);
    expect(warnings.map((w) => w.code)).toEqual([VENN_ZERO_SET]);
    expect(warnings[0]!.message).toContain('set `Z` of size 0');
    expect(warnings[0]!.message).not.toContain('`N`');
  });

  it('never draws NaN: sizes far below 1, a 101-digit size, and one too large to square', () => {
    for (const name of ['tiny-sizes', 'huge-size', 'too-large-size']) {
      const { layout, warnings } = laid(`${LAYOUT}/${name}`);
      expect(layout.areas.some((a) => a.circle)).toBe(true);
      expect(warnings).toEqual([]);
    }
    // Too large to square: laid out as 0, so not drawn (the parser warns, VENN_INVALID_SIZE).
    const { layout } = laid(`${LAYOUT}/too-large-size`);
    expect(layout.areas.map((a) => a.sets.join('+'))).toEqual(['B']);
  });

  it('solves at padding 0 when the padding leaves no room, without a warning', () => {
    const { layout, warnings } = laid(`${LAYOUT}/padding-too-large`);
    expect(layout.padding).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('reads venn.width, height and padding, a numeric string as its number', () => {
    const { layout } = laid(`${LAYOUT}/config-numeric-string`);
    expect([layout.width, layout.height, layout.scale, layout.padding]).toEqual([
      400, 300, 0.25, 0,
    ]);
    // Two equal sets side by side, as wide as the chart.
    const [a, b] = [circleOf(layout, 'A'), circleOf(layout, 'B')];
    expect(Math.min(a.x - a.radius, b.x - b.radius)).toBeCloseTo(0, 6);
    expect(Math.max(a.x + a.radius, b.x + b.radius)).toBeCloseTo(400, 6);
  });

  it('falls back to the default for each value it cannot use, without a warning', () => {
    const { layout, warnings } = laid(`${LAYOUT}/config-unusable-values`);
    expect([layout.width, layout.height, layout.padding, layout.debug]).toEqual([
      800,
      450,
      15,
      undefined,
    ]);
    expect(warnings).toEqual([]);
  });
});

describe('venn layout: labels and text nodes (D414)', () => {
  it('labels a set with its id, an overlap only with its label, and wraps a label to three lines', () => {
    const { layout } = laid(`${LAYOUT}/label-three-lines`);
    const [a, b, ab, again] = layout.areas;
    expect(textOf(b!.label)).toEqual(['B']);
    expect(a!.label!.text.lines.length).toBe(3);
    expect(textOf(a!.label).join(' ')).toBe(
      'one two three four five six seven eight nine ten eleven twelve'
    );
    // The last non-empty label of an area's sets is every copy's (venn.js keys labels by sets).
    expect(textOf(ab!.label)).toEqual(['both']);
    expect(again!.label).toEqual(ab!.label);
    expect(layout.fonts.label.size).toBe(24);
  });

  it('caps a label written on four lines at three, the last lines joined', () => {
    const { layout } = laid(`${LAYOUT}/label-written-on-four-lines`);
    expect(textOf(layout.areas[0]!.label)).toEqual(['a', 'b', 'c d']);
  });

  it('moves a label that would lie on an earlier one below it', () => {
    // B is inside A, and the overlap's centre is B's: v12 drew "B" and "inner" on one spot.
    const { layout } = laid(`${LAYOUT}/label-collision-subset`);
    const b = layout.areas[1]!.label!;
    const ab = layout.areas[2]!.label!;
    expect(ab.y).toBeCloseTo(b.y + b.height, 9);
  });

  it("lays text nodes out in a grid under their set's label, wrapped to their box", () => {
    const { layout } = laid(`${LAYOUT}/text-grid`);
    expect(layout.textAreas.map((t) => [t.sets.join('+'), t.nodes.map((n) => n.id)])).toEqual([
      ['A', ['a1', 'a2', 'a3']],
      ['A+B', ['ab']],
    ]);
    const [a, ab] = layout.textAreas;
    // Three nodes: two columns, two rows, under the set's label "A" (D750).
    expect(a!.nodes[0]!.cell.width).toBeCloseTo(a!.grid.width / 2, 9);
    expect(a!.nodes[2]!.cell.y).toBeCloseTo(a!.grid.y + a!.grid.height / 2, 9);
    const long = a!.nodes[1]!;
    expect(long.box.width).toBeCloseTo(long.cell.width * 0.9, 9);
    expect(long.label.text.lines.length).toBeGreaterThan(1);
    for (const w of long.label.text.widths) expect(w).toBeLessThanOrEqual(long.box.width);
    // The overlap has no label and its node meets none: v12's grid, moved down 30s for one node.
    expect(ab!.grid.width).toBeCloseTo(ab!.inner.radius * 1.9, 9);
    expect(ab!.grid.y).toBeCloseTo(ab!.inner.y - ab!.grid.height / 2 + 15, 9);
    expect(layout.fonts.text.size).toBe(20);
  });

  it('starts the first row 10s below a one-line label, its cells inside the inner circle (D750)', () => {
    // #1295: "Alpha" over its first row of text nodes.
    const { layout } = laid(`${LAYOUT}/text-grid-labelled`);
    const [t] = layout.textAreas;
    const label = labelOf(layout, t!.sets);
    expect(label.text.lines.length).toBe(1);
    expect(t!.grid.y).toBeCloseTo(label.y + label.height + 5, 9);
    expectCellsInside(t!);
  });

  it('starts the grid below a label of several lines, its cells inside the inner circle (D750)', () => {
    // #770 and #1295: a `<br>` label (two lines) over one node, a wrapped one (three) over six.
    const { layout } = laid(`${LAYOUT}/label-lines-above-text-nodes`);
    expect(layout.textAreas.map((t) => [t.sets.join('+'), t.nodes.length])).toEqual([
      ['A', 1],
      ['B', 6],
    ]);
    expect(layout.areas.map((a) => a.label!.text.lines.length)).toEqual([2, 3]);
    for (const t of layout.textAreas) {
      const label = labelOf(layout, t.sets);
      expect(t.grid.y).toBeCloseTo(label.y + label.height + 5, 9);
      for (const n of t.nodes) expect(n.label.y).toBeGreaterThan(label.y + label.height);
      expectCellsInside(t);
    }
  });

  it("keeps every text node clear of its own and its neighbours' labels (D750)", () => {
    // #1295: "Vegetables" over "Carrot"; the three-set themes' "Terraform" under "Everything".
    for (const path of [
      'nightly-check/10-should-render-a-venn-diagram-with-many-text-nodes',
      'baseline/themes/redux-color',
    ]) {
      const { layout } = laid(path);
      for (const t of layout.textAreas) {
        for (const n of t.nodes) {
          for (const a of layout.areas) {
            if (a.label)
              expect(overlaps(n.label, a.label), `${n.id} / ${a.sets.join('+')}`).toBe(false);
          }
        }
      }
    }
    const { layout } = laid('nightly-check/10-should-render-a-venn-diagram-with-many-text-nodes');
    const vegetables = labelOf(layout, ['Vegetables']);
    const carrot = layout.textAreas.flatMap((t) => t.nodes).find((n) => n.id === 'Carrot')!;
    expect(carrot.label.y).toBeGreaterThanOrEqual(vegetables.y + vegetables.height + 5);
  });

  it('draws no text node whose area is not drawn', () => {
    const { layout } = laid(`${LAYOUT}/text-in-undrawn-areas`);
    expect(layout.textAreas.map((t) => t.sets.join('+'))).toEqual(['B']);
  });

  it('adds the inner circles and the cells as plain shapes under useDebugLayout', () => {
    const { layout } = laid('nightly-check/debug-layout');
    expect(layout.debug!.circles).toEqual(layout.textAreas.map((t) => t.inner));
    expect(layout.debug!.cells).toHaveLength(4);
    expect([layout.debug!.circleStroke, layout.debug!.cellStroke]).toEqual([0.75, 0.5]);
  });
});

describe('venn layout: the drawn areas', () => {
  it("draws areas in v12's order: the model's, a repeat again, then v12's added pairs", () => {
    const { layout } = laid(`${LAYOUT}/added-pairs-and-repeats`);
    expect(layout.areas.map((a) => [a.sets.join('+'), a.ast ?? null, a.size])).toEqual([
      ['A', 'set:A', 4],
      ['B', 'set:B', 4],
      ['C', 'set:C', 4],
      ['A', 'set:A@2', 6],
      ['A+B+C', 'union:A+B+C', 1],
      ['A+B', null, 1],
      ['A+C', null, 1],
      ['B+C', null, 1],
    ]);
    // A repeat takes a slot of its own and shares the last copy's circle.
    expect(layout.areas.slice(0, 4).map((a) => [a.index, a.slot])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(layout.areas[0]!.circle).toEqual(layout.areas[3]!.circle);
  });

  it("outlines a set as two half circles and a lens as two arcs; disjoint sets' overlap has none", () => {
    const { layout } = laid(`${LAYOUT}/disjoint-overlap`);
    const a = layout.areas[0]!;
    expect(a.path!.arcs).toHaveLength(2);
    expect(a.path!.start.x).toBeCloseTo(a.circle!.x - a.circle!.radius, 9);
    expect(layout.areas[2]!.path!.arcs).toHaveLength(2);
    const cd = layout.areas.find((x) => x.sets.join() === 'C,D')!;
    expect(cd.path).toBeUndefined();
    expect(cd.centre).toBeUndefined();
  });

  it("takes a circle's stroke from its style, else 5s", () => {
    const { layout } = laid('nightly-check/stroke-styles');
    expect(circleOf(layout, 'A').strokeWidth).toBe(2);
    expect(circleOf(layout, 'B').strokeWidth).toBe(8);
    expect(
      laid('pr-check/1-should-render-a-simple-two-set-venn-diagram').layout.areas[0]!.circle!
        .strokeWidth
    ).toBe(2.5);
  });

  it('lays four sets or more out the same way on every run (D413)', () => {
    const path = 'nightly-check/five-sets-sparse';
    expect(JSON.stringify(laid(path).layout)).toBe(JSON.stringify(laid(path).layout));
  });
});

describe('venn layout invariants', () => {
  it('catch a moved circle, a NaN, overlapping labels, a stray cell, text on a label and short bounds', () => {
    const { model } = fixture(`${LAYOUT}/text-grid-labelled`);
    const { layout: base } = laid(`${LAYOUT}/text-grid-labelled`);
    const broken = (patch: Partial<VennLayout>) =>
      vennLayoutViolations(model, { ...base, ...patch });
    const a = setArea(base.areas[0]);
    expect(
      broken({ areas: [{ ...a, circle: { ...a.circle, radius: a.circle.radius * 2 } }] })
    ).toEqual(expect.arrayContaining([expect.stringContaining('outside the chart')]));
    expect(broken({ scale: Number.NaN })).toEqual(['layout.scale is NaN']);
    expect(broken({ bounds: { x: 0, y: 0, width: 10, height: 10 } })[0]).toMatch(
      /outside the bounds/
    );
    const [t] = base.textAreas;
    const n = t!.nodes[0]!;
    const far = { ...n, cell: { ...n.cell, x: n.cell.x - 1000 } };
    expect(broken({ textAreas: [{ ...t!, nodes: [far, ...t!.nodes.slice(1)] }] })).toEqual(
      expect.arrayContaining([
        expect.stringContaining('past its radius'),
        expect.stringContaining('outside the grid'),
      ])
    );
    // A text node drawn on its set's label (#1295).
    const label = base.areas[0]!.label!;
    const onLabel = { ...n, label: { ...n.label, x: label.x, y: label.y } };
    expect(broken({ textAreas: [{ ...t!, nodes: [onLabel, ...t!.nodes.slice(1)] }] })).toEqual(
      expect.arrayContaining([expect.stringContaining('text node a1 meets the label of A')])
    );
    // Two labels on one spot, and a size that does not match the area.
    const { model: two } = fixture('pr-check/1-should-render-a-simple-two-set-venn-diagram');
    const { layout: pair } = laid('pr-check/1-should-render-a-simple-two-set-venn-diagram');
    const [p, q, pq] = pair.areas;
    expect(
      vennLayoutViolations(two, { ...pair, areas: [p!, { ...q!, label: p!.label! }, pq!] })
    ).toEqual(expect.arrayContaining([expect.stringContaining('labels of A and B overlap')]));
    const b = setArea(q);
    const smaller = { ...b, circle: { ...b.circle, radius: b.circle.radius / 2 } };
    expect(vennLayoutViolations(two, { ...pair, areas: [p!, smaller, pq!] })).toEqual(
      expect.arrayContaining([expect.stringContaining('area per unit of size')])
    );
  });
});
