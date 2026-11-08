import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { Theme } from '@mermaid-js/core/theme';
import { VENN_CONFIG_INVALID, VENN_ZERO_SET } from '../codes.ts';
import { vennTestContext, vennTestTheme } from '../test-context.ts';
import { gridMeasurer, parsed, venn } from './fixtures.ts';
import { vennLayoutViolations } from './invariants.ts';
import { layoutVenn } from './layout.ts';
import type { VennLayout } from './types.ts';

let theme: Theme;
beforeAll(async () => {
  theme = await vennTestTheme();
});

/** The layout of `src` with its front-matter config, the warnings, and the invariants checked. */
function laid(
  src: string,
  section: Readonly<Record<string, unknown>> = {},
  measurer = gridMeasurer
): { layout: VennLayout; warnings: Warning[] } {
  const { model, config } = parsed(src);
  const warnings: Warning[] = [];
  const layout = layoutVenn(
    model,
    vennTestContext(theme, { ...config, ...section }, warnings, measurer)
  );
  expect(vennLayoutViolations(model, layout)).toEqual([]);
  return { layout, warnings };
}

const circleOf = (layout: VennLayout, id: string) =>
  layout.areas.find((a) => a.kind === 'set' && a.sets[0] === id)!.circle!;

describe('venn layout: the solve (D411, D412)', () => {
  it('draws three equal sets as an equilateral triangle, d / r ≈ 1.2632, C on top', () => {
    const { layout } = laid(
      venn('set A', 'set B', 'set C', 'union A,B', 'union A,C', 'union B,C', 'union A,B,C')
    );
    const [a, b, c] = ['A', 'B', 'C'].map((id) => circleOf(layout, id));
    const d = (p: typeof a, q: typeof a) =>
      Math.hypot(p!.center.x - q!.center.x, p!.center.y - q!.center.y);
    expect(a!.radius).toBeCloseTo(b!.radius, 9);
    expect(a!.radius).toBeCloseTo(c!.radius, 9);
    for (const [p, q] of [
      [a, b],
      [a, c],
      [b, c],
    ] as const) {
      expect(d(p, q) / a!.radius).toBeCloseTo(1.2632, 3);
    }
    expect(c!.center.y).toBeLessThan(Math.min(a!.center.y, b!.center.y));
  });

  it("gives two equal sets v12's drawn radius of 210 at the default 800 × 450 and padding 15", () => {
    const { layout } = laid(venn('set A', 'set B', 'union A,B'));
    expect(layout.padding).toBe(15);
    expect(circleOf(layout, 'A').radius).toBeCloseTo(210, 6);
    expect(circleOf(layout, 'B').radius).toBeCloseTo(210, 6);
  });
});

describe('venn layout: input v12 drew badly or not at all (D417)', () => {
  it('draws an empty diagram as its title only', () => {
    const { layout } = laid(venn('title Nothing yet'));
    expect(layout.areas).toEqual([]);
    expect(layout.title?.text.lines.length).toBe(1);
    // Centred on (width / 2, 32s), at 32 px whatever the scale.
    expect(layout.title!.x + layout.title!.width / 2).toBe(400);
    expect(layout.title!.y + layout.title!.height / 2).toBe(16);
    expect(layout.fonts.title.size).toBe(32);
    expect(layout.titleHeight).toBe(24);
    expect(layout.offset).toEqual({ x: 0, y: 24 });
  });

  it('drops a zero-size set and every overlap with it, with one VENN_ZERO_SET', () => {
    const { layout, warnings } = laid(
      venn('set A:0', 'set B:4', 'set C:3', 'union A,B:1', 'union B,C:1', 'set D:-2')
    );
    expect(layout.areas.map((a) => a.sets.join('+'))).toEqual(['B', 'C', 'B+C']);
    expect(warnings.map((w) => w.code)).toEqual([VENN_ZERO_SET]);
    expect(warnings[0]!.message).toContain('`A`, `D`');
  });

  it('never draws NaN: sizes too small or too large to square, and a lone set', () => {
    for (const src of [
      venn(
        'set A:0.0000000000000000000000000000001',
        'set B:1',
        'union A,B:0.00000000000000000000000000000001'
      ),
      venn(`set A:1${'0'.repeat(200)}`, 'set B:1'),
      venn(`set A:1${'0'.repeat(400)}`, 'set B:1'),
      venn('set A'),
    ]) {
      const { layout } = laid(src);
      expect(layout.areas.some((a) => a.circle)).toBe(true);
    }
  });

  it('falls back to padding 0 when the padding leaves no room, with VENN_CONFIG_INVALID', () => {
    const { layout, warnings } = laid(venn('set A', 'set B'), { padding: 300 });
    expect(layout.padding).toBe(0);
    expect(warnings.map((w) => w.code)).toEqual([VENN_CONFIG_INVALID]);
  });

  it('reads venn.width, height and padding, and warns once about every value it cannot use', () => {
    const { layout } = laid(venn('set A', 'set B', 'union A,B'), {
      width: '400',
      height: 300,
      padding: 0,
    });
    expect([layout.width, layout.height, layout.scale, layout.padding]).toEqual([
      400, 300, 0.25, 0,
    ]);
    // Two equal sets side by side, as wide as the chart.
    const [a, b] = [circleOf(layout, 'A'), circleOf(layout, 'B')];
    expect(Math.min(a.center.x - a.radius, b.center.x - b.radius)).toBeCloseTo(0, 6);
    expect(Math.max(a.center.x + a.radius, b.center.x + b.radius)).toBeCloseTo(400, 6);
    const { layout: bad, warnings } = laid(venn('set A'), {
      width: 'wide',
      height: -1,
      useDebugLayout: 'yes',
    });
    expect([bad.width, bad.height, bad.debug]).toEqual([800, 450, undefined]);
    expect(warnings.map((w) => w.code)).toEqual([VENN_CONFIG_INVALID]);
    expect(warnings[0]!.message).toMatch(/venn\.width .*venn\.height .*venn\.useDebugLayout/);
  });
});

describe('venn layout: labels and text nodes (D414)', () => {
  it('labels a set with its id, an overlap only with its label, and keeps a label to three lines', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve';
    const { layout } = laid(venn(`set A["${long}"]`, 'set B', 'union A,B', 'union A,B["both"]'));
    const [a, b, ab] = layout.areas;
    expect(b!.label!.text.lines.map((l) => l.map((r) => r.text).join(''))).toEqual(['B']);
    expect(a!.label!.text.lines.length).toBe(3);
    // The last non-empty label of an area's sets is every copy's (venn.js keys labels by sets).
    expect(
      ab!
        .label!.text.lines.flat()
        .map((r) => r.text)
        .join('')
    ).toBe('both');
    expect(layout.areas[3]!.label).toEqual(ab!.label);
    expect(layout.fonts.label.size).toBe(24);
  });

  it('keeps a label written on more than three lines as written', () => {
    const { layout } = laid(venn('set A["a<br>b<br>c<br>d"]', 'set B'));
    expect(layout.areas[0]!.label!.text.lines.length).toBe(4);
  });

  it('moves a label that would lie on an earlier one below it', () => {
    // B is inside A, and the overlap's centre is B's: v12 drew "B" and "inner" on one spot.
    const { layout } = laid(venn('set A:10', 'set B:2', 'union A,B["inner"]:2'));
    const b = layout.areas[1]!.label!;
    const ab = layout.areas[2]!.label!;
    expect(ab.y).toBeCloseTo(b.y + b.height, 9);
  });

  it("lays text nodes out in v12's grid about the area's centre, wrapped to their box", () => {
    const { layout } = laid(
      venn(
        'set A',
        '  text a1',
        '  text a2["a much longer text node label"]',
        '  text a3',
        'set B',
        'union A,B',
        '  text ab'
      )
    );
    expect(layout.textAreas.map((t) => [t.sets.join('+'), t.nodes.map((n) => n.id)])).toEqual([
      ['A', ['a1', 'a2', 'a3']],
      ['A+B', ['ab']],
    ]);
    const [a, ab] = layout.textAreas;
    // Three nodes: two columns, two rows, no offset (more than two nodes, no label).
    expect(a!.grid.width).toBeCloseTo(a!.innerRadius * 1.9, 9);
    expect(a!.grid.y).toBeCloseTo(a!.centre.y - a!.grid.height / 2, 9);
    expect(a!.nodes[0]!.cell.width).toBeCloseTo(a!.grid.width / 2, 9);
    expect(a!.nodes[2]!.cell.y).toBeCloseTo(a!.grid.y + a!.grid.height / 2, 9);
    expect(a!.nodes[1]!.box.width).toBeCloseTo(a!.nodes[1]!.cell.width * 0.9, 9);
    expect(a!.nodes[1]!.label.text.lines.length).toBeGreaterThan(1);
    for (const line of a!.nodes[1]!.label.text.widths)
      expect(line).toBeLessThanOrEqual(a!.nodes[1]!.box.width);
    // One node: moved down 30s.
    expect(ab!.grid.y).toBeCloseTo(ab!.centre.y - ab!.grid.height / 2 + 15, 9);
    expect(layout.fonts.text.size).toBe(20);
  });

  it("gives a labelled area's grid the label offset, min(32s, innerRadius / 4)", () => {
    const { layout } = laid(venn('set A["Alpha"]', '  text a1', '  text a2', '  text a3'));
    const [t] = layout.textAreas;
    const offset = Math.min(16, t!.innerRadius / 4);
    expect(t!.grid.y).toBeCloseTo(t!.centre.y - t!.grid.height / 2 + offset, 9);
  });

  it('draws no text node whose area is not drawn', () => {
    const { layout } = laid(venn('set A:0', '  text a1', 'set B', '  text b1', 'text Z z1'));
    expect(layout.textAreas.map((t) => t.sets.join('+'))).toEqual(['B']);
  });

  it('adds the inner circle and the cells as plain shapes under useDebugLayout', () => {
    const { layout } = laid(venn('set A', '  text a1', '  text a2', 'set B', '  text b1'), {
      useDebugLayout: true,
    });
    expect(layout.debug!.circles.map((c) => c.radius)).toEqual(
      layout.textAreas.map((t) => t.innerRadius)
    );
    expect(layout.debug!.cells).toHaveLength(3);
    expect([layout.debug!.circleStroke, layout.debug!.cellStroke]).toEqual([0.75, 0.5]);
  });
});

describe('venn layout: the drawn areas', () => {
  it("draws areas in v12's order: the model's, a repeat again, then v12's added pairs", () => {
    const { layout } = laid(venn('set A:4', 'set B:4', 'set C:4', 'set A:6', 'union A,B,C:1'));
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
    const { layout } = laid(venn('set A', 'set B', 'union A,B', 'set C', 'set D', 'union C,D:0'));
    const a = layout.areas[0]!;
    expect(a.path!.arcs).toHaveLength(2);
    expect(a.path!.start.x).toBeCloseTo(a.circle!.center.x - a.circle!.radius, 9);
    expect(layout.areas[2]!.path!.arcs).toHaveLength(2);
    const cd = layout.areas.find((x) => x.sets.join() === 'C,D')!;
    expect(cd.path).toBeUndefined();
    expect(cd.centre).toBeUndefined();
  });

  it("takes a circle's stroke from its style, else 5s", () => {
    const { layout } = laid(venn('set A', 'set B', 'style A stroke-width: 12'));
    expect(circleOf(layout, 'A').strokeWidth).toBe(12);
    expect(circleOf(layout, 'B').strokeWidth).toBe(2.5);
  });

  it('lays four sets or more out the same way on every run (D413)', () => {
    const src = venn(
      'set A:5',
      'set B:4',
      'set C:3',
      'set D:2',
      'set E:6',
      'union A,B:1',
      'union C,D:1',
      'union A,E:2',
      'union B,C:0.5'
    );
    expect(JSON.stringify(laid(src).layout)).toBe(JSON.stringify(laid(src).layout));
  });
});

describe('venn layout invariants', () => {
  const src = venn('set A["Alpha"]', '  text a1', 'set B', 'union A,B["both"]');

  it('catch a moved circle, a NaN, overlapping labels and short bounds', () => {
    const { model } = parsed(src);
    const { layout } = laid(src);
    const [a, b, ab] = layout.areas;
    const broken = (patch: Partial<VennLayout>) =>
      vennLayoutViolations(model, { ...layout, ...patch });
    expect(
      broken({
        areas: [{ ...a!, circle: { ...a!.circle!, radius: a!.circle!.radius * 2 } }, b!, ab!],
      })
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('area per unit of size'),
        expect.stringContaining('outside the chart'),
      ])
    );
    expect(broken({ scale: Number.NaN })).toEqual(['layout.scale is NaN']);
    expect(broken({ areas: [a!, { ...b!, label: a!.label! }, ab!] })).toEqual(
      expect.arrayContaining([expect.stringContaining('labels of A and B overlap')])
    );
    expect(broken({ bounds: { x: 0, y: 0, width: 10, height: 10 } })[0]).toMatch(
      /outside the bounds/
    );
    const [t] = layout.textAreas;
    const n = t!.nodes[0]!;
    expect(
      broken({ textAreas: [{ ...t!, nodes: [{ ...n, cell: { ...n.cell, x: n.cell.x - 1000 } }] }] })
    ).toEqual(expect.arrayContaining([expect.stringContaining('outside the grid')]));
  });
});
