import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { gridPosition, placeGrid, sizeGrid, type GridNode } from './grid.ts';
import { blockLayoutViolations } from './invariants.ts';
import { layoutBlock } from './layout.ts';
import { FIXTURES, fixture, gridMeasurer } from './mmd.fixtures.ts';
import type { BlockLayout, BlockNodeLayout } from './types.ts';
import { blockTestContext, blockTestTheme, parsedBlock } from '../test-context.ts';
import { outlineDistance } from '../shapes/outline.ts';

/**
 * The block layout (spec #521 T3) through `layoutBlock`, with the grid measurer (10 px a
 * character, lines 1.25 em) in redux-color, core's default theme: 14 px text, so a line is
 * 17.5 high, and node padding 16 across and 12 down per side. A one-letter square is then
 * `12 + 2·16 = 44` by `17.5 + 2·12 = 41.5`.
 */
let theme: Theme;
beforeAll(async () => {
  theme = await blockTestTheme();
});

function lay(src: string, section: Readonly<Record<string, unknown>> = {}): BlockLayout {
  const { model, diagnostics } = parsedBlock(src);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return layoutBlock(model, blockTestContext(theme, section, gridMeasurer));
}

const byId = (l: BlockLayout, id: string): BlockNodeLayout => l.blocks.find((b) => b.id === id)!;
const right = (r: { x: number; width: number }): number => r.x + r.width;

describe('v12 layout.spec.ts, ported', () => {
  it('should calculate position correctly', () => {
    expect(gridPosition(2, 0)).toEqual({ px: 0, py: 0 });
    expect(gridPosition(2, 1)).toEqual({ px: 1, py: 0 });
    expect(gridPosition(2, 2)).toEqual({ px: 0, py: 1 });
    expect(gridPosition(2, 3)).toEqual({ px: 1, py: 1 });
    expect(gridPosition(2, 4)).toEqual({ px: 0, py: 2 });
    expect(gridPosition(1, 3)).toEqual({ px: 0, py: 3 });
  });

  it('should read block.padding at call time', () => {
    const root = (): GridNode => {
      const leaf = (): GridNode => ({
        space: false,
        span: 1,
        band: 0,
        children: [],
        w: 100,
        h: 50,
        x: 0,
        y: 0,
      });
      return {
        space: false,
        span: 1,
        columns: 2,
        band: 0,
        children: [leaf(), leaf()],
        w: 0,
        h: 0,
        x: 0,
        y: 0,
      };
    };
    // padding 4: 2·(100 + 4) + 4; padding 20: 2·(100 + 20) + 20.
    for (const [padding, width] of [
      [4, 212],
      [20, 260],
    ] as const) {
      const r = root();
      sizeGrid(r, padding, 16);
      placeGrid(r, padding);
      expect(r.w).toBe(width);
      expect(r.children.map((c) => c.x)).toEqual([50, 50 + 100 + padding]);
    }
    // Through the config.
    expect(lay('block\na b', { padding: 4 }).blocks[1]!.cell.x).toBe(44 + 4);
    expect(lay('block\na b', { padding: 20 }).blocks[1]!.cell.x).toBe(44 + 20);
  });
});

describe('sizes', () => {
  it('measures each leaf in the font it is drawn in, never wrapped, plus its padding', () => {
    const l = lay('block\na bbbbbbbbbb');
    // Every cell is the widest: 100 + 2·16.
    expect(l.blocks.map((b) => b.cell)).toEqual([
      { x: 0, y: -20.75, width: 132, height: 41.5 },
      { x: 140, y: -20.75, width: 132, height: 41.5 },
    ]);
    const big = lay('block\nclassDef big font-size:28px\na\nclass a big');
    // 28 px text: a 35 px line, 12 + 32 wide (one letter, 10 px at any size).
    expect(big.blocks[0]!.cell.height).toBe(35 + 24);
    expect(big.blocks[0]!.label!.font.size).toBe(28);
    const long = lay(`block\na["${'word '.repeat(40).trim()}"]`);
    expect(long.blocks[0]!.label!.text.lines).toHaveLength(1);
  });

  it('takes the shape padding from the theme, over block.padding in the classic themes', async () => {
    const { model, resolved } = parsedBlock('---\nconfig:\n  theme: default\n---\nblock\na');
    const classic = await blockTestTheme(resolved);
    const at = (padding: number) =>
      layoutBlock(model, blockTestContext(classic, { padding }, gridMeasurer)).blocks[0]!.cell;
    // classic: 16 px text (a 20 px line); nodePaddingX is 2 · padding, nodePaddingY padding.
    expect(at(8)).toMatchObject({ width: 12 + 2 * 16, height: 20 + 2 * 8 });
    expect(at(4)).toMatchObject({ width: 12 + 2 * 8, height: 20 + 2 * 4 });
  });

  it('spans: a span of w is w · maxW + (w − 1) · padding', () => {
    const l = lay('block\ncolumns 3\na b:2 c d e');
    expect(byId(l, 'b').cell.width).toBe(2 * 44 + 8);
    expect(byId(l, 'c').cell.y).toBeGreaterThan(byId(l, 'a').cell.y);
  });

  it('spaces take cells and draw nothing', () => {
    const l = lay('block\ncolumns 3\na space b');
    const space = l.blocks[1]!;
    expect(space.shape).toBe('space');
    expect(space.outline).toBeUndefined();
    expect(space.label).toBeUndefined();
    expect(byId(l, 'b').cell.x).toBe(2 * (44 + 8));
  });

  it('a block wider than the rest of its row overflows the grid, and the next starts a row', () => {
    const l = lay('block\ncolumns 2\na b:2 c');
    expect(byId(l, 'b').cell).toMatchObject({ x: 52, width: 96 });
    expect(byId(l, 'c').cell).toMatchObject({ x: 0, y: -45.5 + 41.5 + 8 });
  });

  it('stretches the fill shapes to their cell, centres circle, double circle and diamond', () => {
    const l = lay('block\ncolumns 1\nwide["wwwwwwwwwwwwwwwwwwww"]\nc(("c"))\nr("r")\nd{"d"}');
    const c = byId(l, 'c');
    expect(c.cell.width).toBe(232);
    expect(c.box).toEqual({ x: 116 - 22, y: c.cell.y, width: 44, height: 44 });
    expect(byId(l, 'r').box).toEqual(byId(l, 'r').cell);
    expect(byId(l, 'r').outline).toMatchObject({ kind: 'rect', rx: 5 });
    expect(byId(l, 'd').box.width).toBeLessThan(232);
  });

  it('stretches a block arrow only when it spans', () => {
    const l = lay('block\ncolumns 3\nw["wwwwwwwwww"] x y\nn<["n"]>(right) s<["s"]>(right):2');
    const n = byId(l, 'n');
    const s = byId(l, 's');
    // A right arrow's tip is the right end of its width: the cell's when it spans.
    expect(n.cell.width).toBe(132);
    expect(right(n.box)).toBeLessThan(right(n.cell));
    expect(right(s.box)).toBe(right(s.cell));
  });

  it('gives a labelled composite a label band above its grid (D444), none to an unlabelled one', () => {
    const l = lay('block\nblock:g["Group label"]\na\nend\nblock:h\nb\nend');
    const group = byId(l, 'g');
    const a = byId(l, 'a');
    // The label (110 × 17.5) at the padding below the top; the grid below the band.
    expect(group.label).toMatchObject({ y: group.cell.y + 8, width: 110, height: 17.5 });
    expect(a.cell.y).toBe(group.cell.y + 8 + 17.5 + 8);
    // As wide as its label, with v12's composite padding (0): `a` is widened to fill it.
    expect(group.cell.width).toBe(110);
    expect(group.label!.x).toBe(group.cell.x);
    expect(a.cell.width).toBe(110 - 2 * 8);
    expect(byId(l, 'h').label).toBeUndefined();
    expect(byId(l, 'b').cell.y).toBe(byId(l, 'h').cell.y + 8);
  });

  it('keeps v12’s even stretch: a spanning composite can end narrower than its grid', () => {
    const { model, config } = fixture(
      'nightly-check/nested-spanning-composite-stretched-by-a-sibling'
    );
    const l = layoutBlock(model, blockTestContext(theme, config));
    const i = byId(l, 'i');
    const e = byId(l, 'e');
    // `e` ends past `i` (as v12 drew it), and the invariant counts its row as overflowing.
    expect(right(e.box) - right(i.box)).toBeGreaterThan(50);
    expect(blockLayoutViolations(l)).toEqual([]);
  });
});

describe('edges (D441)', () => {
  const ends = (l: BlockLayout) =>
    l.edges.map((e) => {
      const p0 = e.points[0]!;
      const p1 = e.points.at(-1)!;
      const a = byId(l, e.start);
      const b = byId(l, e.end);
      return [
        outlineDistance(a.outline!, { x: p0.x - a.centre.x, y: p0.y - a.centre.y }),
        outlineDistance(b.outline!, { x: p1.x - b.centre.x, y: p1.y - b.centre.y }),
      ];
    });

  it('draws a straight segment between the centres, clipped at both outlines', () => {
    const l = lay('block\na --> b\nc(("c")) --> d{"d"}');
    const [ab] = l.edges;
    expect(ab!.kind).toBe('line');
    expect(ab!.points).toEqual([
      { x: 44, y: 0 },
      { x: 48, y: 0 },
      { x: 52, y: 0 },
    ]);
    for (const [s, t] of ends(l)) {
      expect(s).toBeLessThan(1e-9);
      expect(t).toBeLessThan(1e-9);
    }
  });

  it('overlaps parallel edges, as v12', () => {
    const l = lay('block\na --> b\na --> b');
    expect(l.edges[0]!.points).toEqual(l.edges[1]!.points);
  });

  it('draws a self-loop as a visible arc from the outline back to it', () => {
    const l = lay('block\na --> a');
    const loop = l.edges[0]!;
    const a = byId(l, 'a');
    expect(loop.kind).toBe('loop');
    expect(loop.points).toHaveLength(4);
    const [s, c1, c2, t] = loop.points as [
      typeof a.centre,
      typeof a.centre,
      typeof a.centre,
      typeof a.centre,
    ];
    // On the top and on the right side, its control points out past the box.
    expect(s.y).toBeCloseTo(a.box.y, 9);
    expect(t.x).toBeCloseTo(right(a.box), 9);
    expect(c1.y).toBeLessThan(a.box.y);
    expect(c2.x).toBeGreaterThan(right(a.box));
    expect(Math.hypot(t.x - s.x, t.y - s.y)).toBeGreaterThan(0);
    expect(ends(l)[0]!.every((d) => d < 1e-9)).toBe(true);
  });

  it('clips an edge to a composite at its outline, and to a block inside it', () => {
    const l = lay('block\nblock:g\na b\nend\nc\na --> g\ng --> c');
    expect(blockLayoutViolations(l)).toEqual([]);
    for (const [s, t] of ends(l)) {
      expect(s).toBeLessThan(1e-9);
      expect(t).toBeLessThan(1e-9);
    }
  });

  it('centres an edge label on the centres’ midpoint', () => {
    const l = lay('block\na-- "go" -->b');
    const label = l.edges[0]!.label!;
    expect(label.x + label.width / 2).toBe(48);
    expect(label.y + label.height / 2).toBe(0);
  });
});

describe('block arrows (#1193)', () => {
  // v12 sized an arrow from its drawn polygon, so the four-way arrow's heads stay inside its
  // cell and the grid's padding stays between neighbouring arrows.
  it('keeps every pair of arrow polygons at least block.padding apart', () => {
    const { model, config } = fixture(
      'nightly-check/should-handle-block-arrows-in-different-directions'
    );
    const l = layoutBlock(model, blockTestContext(theme, config, gridMeasurer));
    const arrows = l.blocks.filter((b) => b.shape === 'block-arrow').map((b) => b.box);
    expect(arrows).toHaveLength(7);
    for (const [i, a] of arrows.entries()) {
      for (const b of arrows.slice(i + 1)) {
        const gapX = Math.max(b.x - right(a), a.x - right(b));
        const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
        expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(l.padding - 1e-9);
      }
    }
  });
});

describe('bounds (D224) and degenerate input (D445)', () => {
  it('cover everything drawn, plus 5 px', () => {
    const l = lay('block\na --> a');
    const a = byId(l, 'a');
    expect(l.bounds.x).toBe(a.box.x - 5);
    expect(right(l.bounds)).toBeCloseTo(Math.max(...l.edges[0]!.points.map((p) => p.x)) + 5, 9);
    expect(l.bounds.y).toBeCloseTo(Math.min(...l.edges[0]!.points.map((p) => p.y)) - 5, 9);
  });

  it('leave a space that ends a row out, as v12 drew nothing there', () => {
    const l = lay('block\na space');
    expect(right(l.bounds)).toBe(44 + 5);
  });

  it('lay out an empty diagram, and a padding that is not a number of 0 or more as 8', () => {
    // `block` alone is rejected; its model (no blocks) still lays out.
    const empty = parsedBlock('block\n').model;
    expect(layoutBlock(empty, blockTestContext(theme)).bounds).toEqual({
      x: -5,
      y: -5,
      width: 10,
      height: 10,
    });
    for (const padding of [Number.NaN, -3, 'x', Infinity]) {
      expect(lay('block\na b', { padding }).padding).toBe(8);
    }
    expect(lay('block\na b', { padding: 0 }).blocks[1]!.cell.x).toBe(44);
    // Past 1,000 the padding is cut to 1,000 (D445); the warning is the plugin's (block.spec.ts).
    expect(lay('block\na b', { padding: 1e9 }).padding).toBe(1000);
    expect(lay('block\na b', { padding: 1000 }).padding).toBe(1000);
  });

  it('lay out the degenerate fixtures without NaN', () => {
    for (const path of [
      'nightly-check/columns-zero-reads-as-auto',
      'nightly-check/span-zero-reads-as-one',
      'nightly-check/span-over-the-cap-is-cut',
      'nightly-check/block-arrow-directions-with-blanks',
    ]) {
      const { model, config } = fixture(path);
      expect(blockLayoutViolations(layoutBlock(model, blockTestContext(theme, config)))).toEqual(
        []
      );
    }
  });
});

describe('block layout invariants on the e2e fixtures', () => {
  it.each(FIXTURES)('%s', async (path) => {
    const { model, config, resolved } = fixture(path);
    const sourceTheme = await blockTestTheme(resolved);
    const layout = layoutBlock(model, blockTestContext(sourceTheme, config));
    expect(blockLayoutViolations(layout)).toEqual([]);
  });
});
