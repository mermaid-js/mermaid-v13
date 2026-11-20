import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import { DEFAULT_LIMITS } from '@mermaid-js/core/limits';
import type { Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { C4_BOUNDARY_CYCLE } from '../codes.ts';
import { c4TestContext, c4TestTheme, parsedC4 } from '../test-context.ts';
import { c4LayoutViolations, c4RelationCrossings } from './invariants.ts';
import { layoutC4 } from './layout.ts';
import { C4_METRICS as M } from './metrics.ts';
import { c4RelationPath } from './path.ts';
import { fixture, fixtureSource, FIXTURES } from './mmd.fixtures.ts';
import type { C4Layout, C4RelationLayout, PlacedLabel, Point, Rect } from './types.ts';

/**
 * The C4 layout (spec #522 T3) through its seam, `layoutC4(model, ctx)`, on parser-produced
 * sources (R-LAYOUT-3): the invariants hold on every e2e fixture and the docs examples, and the
 * grid (D454), the router (D455), the text and the title do what the spec asks.
 */
let theme: Theme;
/**
 * The themes the invariants are checked in (#679): the product default, which a document with no
 * `theme` draws in, and the classic `default` the numbers below are pinned in.
 */
let themes: [string, Theme][];
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'));
  themes = [
    ['the product default theme', await c4TestTheme()],
    ['theme default', await c4TestTheme('default')],
  ];
});

/** Every character 10 px wide at any size, lines 1.2 em high: round numbers for wrapping. */
const grid: Measurer = {
  id: 'c4-grid',
  width: (text) => [...text].length * 10,
  metrics: (font) => ({ ascent: font.size, descent: font.size / 5, lineHeight: font.size * 1.2 }),
};

function lay(
  src: string,
  {
    integrator,
    measurer,
    warnings = [],
  }: { integrator?: Record<string, unknown>; measurer?: Measurer; warnings?: Warning[] } = {}
) {
  const parsed = parsedC4(src, integrator);
  const layout = layoutC4(parsed.model, c4TestContext(parsed.config, theme, warnings, measurer));
  return { ...parsed, layout };
}

const sound = (src: string, options?: Parameters<typeof lay>[1]): C4Layout => {
  const { model, layout } = lay(src, options);
  expect(c4LayoutViolations(model, layout)).toEqual([]);
  return layout;
};

const el = (layout: C4Layout, alias: string) => layout.elements.find((e) => e.alias === alias)!;
const frame = (layout: C4Layout, alias: string) =>
  layout.boundaries.find((b) => b.alias === alias)!;
const rel = (layout: C4Layout, from: string, to: string): C4RelationLayout =>
  layout.relations.find((r) => r.from === from && r.to === to)!;
const right = (r: Rect): number => r.x + r.width;
/** A label's text, its lines joined by a blank. */
const textOf = (l: PlacedLabel): string =>
  l.text.lines.map((line) => line.map((run) => run.text).join('')).join(' ');
const bottom = (r: Rect): number => r.y + r.height;

/**
 * Relations that cross an element on the e2e fixtures (the spec allows listed exceptions): none.
 * The large diagram's lines between boundaries, which no elbow of two bends clears, once went
 * straight through the shapes in their way; they take a path through the channels between the
 * shapes now (#774).
 */
const CROSSING_EXCEPTIONS: string[] = [];

/**
 * Labels with no clear spot on the e2e fixtures, each over another relation's line, as it was
 * before labels kept off other lines. In `rows-and-fixed-width`, `b -> p`'s upright lane runs
 * down the middle of the gap between `c` and `d`, past both rows: `Moves to` fills too much of
 * that gap to clear it on its line, and beside it clears the lane only below `c`, three label
 * depths out, which costs more than the crossing. (The docs' container example's
 * `backend_api -> banking_system` was listed too, until the person figure, #683, moved its rows.)
 */
const CROWDED_EXCEPTIONS = [
  'baseline/config/rows-and-fixed-width table: c -> d',
  'baseline/config/rows-and-fixed-width grid: c -> d',
];

describe('c4 layout invariants on the e2e fixtures', () => {
  it('finds the fixtures, the five docs files (the six syntax-page examples) among them', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(46);
    expect(FIXTURES.filter((f) => f.startsWith('nightly-check/docs/'))).toHaveLength(5);
  });

  it.each(FIXTURES)('hold on %s', (path) => {
    const { model, config } = fixture(path);
    const runs = themes.flatMap(([themeName, drawn]) => [
      { name: 'table', measurer: undefined, themeName, drawn },
      { name: 'grid', measurer: grid, themeName, drawn },
    ]);
    for (const { name, measurer, themeName, drawn } of runs) {
      const layout = layoutC4(model, c4TestContext(config, drawn, [], measurer));
      expect(c4LayoutViolations(model, layout), themeName).toEqual([]);
      // Every label found a spot off its own arrowheads, the elements, the headers (#542) and
      // the other relations' lines, so the label invariant held for each, none excused as
      // crowded but the listed ones.
      const crowded = layout.relations
        .filter((r) => r.crowded)
        .map((r) => `${path} ${name}: ${r.from} -> ${r.to}`);
      expect(crowded).toEqual(CROWDED_EXCEPTIONS.filter((c) => c.startsWith(`${path} ${name}:`)));
    }
  });

  it('cross no element but the listed relations, in the product default theme and a classic one', () => {
    for (const [themeName, drawn] of themes) {
      let relations = 0;
      const crossings = FIXTURES.flatMap((path) => {
        const { model, config } = fixture(path);
        const layout = layoutC4(model, c4TestContext(config, drawn));
        relations += layout.relations.length;
        return c4RelationCrossings(layout).map((c) => `${path}: ${c}`);
      });
      expect(relations, themeName).toBeGreaterThan(130);
      expect(crossings, themeName).toEqual(CROSSING_EXCEPTIONS);
    }
  });
});

describe('c4 grid (D454)', () => {
  it('fills rows of c4ShapeInRow in statement order, 2·c4ShapeMargin apart, each element at least c4.width wide', () => {
    const layout = sound(
      'C4Context\nSystem(a, "A")\nSystem(b, "B")\nSystem(c, "C")\nSystem(d, "D")\nSystem(e, "E")'
    );
    const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map((x) => el(layout, x).box);
    expect([a, b, c, d].map((r) => r!.y)).toEqual([a!.y, a!.y, a!.y, a!.y]);
    expect(b!.x - right(a!)).toBe(100);
    expect(e!.x).toBe(a!.x);
    expect(e!.y - bottom(a!)).toBe(100);
    expect(a!.width).toBe(216);
  });

  it('takes c4ShapeInRow from config, and UpdateLayoutConfig over it', () => {
    const src = 'C4Context\nSystem(a, "A")\nSystem(b, "B")\nSystem(c, "C")';
    const rows = (layout: C4Layout) => new Set(layout.elements.map((e) => e.box.y)).size;
    expect(rows(sound(src))).toBe(1);
    expect(rows(sound(src, { integrator: { c4: { c4ShapeInRow: 1 } } }))).toBe(3);
    expect(
      rows(
        sound(src + '\nUpdateLayoutConfig($c4ShapeInRow="2")', {
          integrator: { c4: { c4ShapeInRow: 1 } },
        })
      )
    ).toBe(2);
    const { model, config } = fixture('visual-check/update-layout-config-2-shapes-per-row');
    expect(rows(layoutC4(model, c4TestContext(config, theme)))).toBe(2);
  });

  it('reads the config lengths, and falls back to the defaults for values it cannot use', () => {
    const src = 'C4Context\nSystem(a, "A")\nSystem(b, "B")';
    const gap = (layout: C4Layout) => el(layout, 'b').box.x - right(el(layout, 'a').box);
    expect(gap(sound(src, { integrator: { c4: { c4ShapeMargin: 10 } } }))).toBe(20);
    expect(el(sound(src, { integrator: { c4: { width: 300 } } }), 'a').box.width).toBe(300);
    const margins = sound(src, { integrator: { c4: { diagramMarginX: 7, diagramMarginY: 3 } } });
    expect(margins.bounds.x).toBe(7);
    expect(margins.bounds.y).toBe(3);
    expect(margins.width).toBe(right(margins.bounds) + 7);
    const odd = sound(src, {
      integrator: { c4: { c4ShapeMargin: 'wide', width: Number.NaN, c4ShapeInRow: -2 } },
    });
    expect(gap(odd)).toBe(100);
    expect(el(odd, 'a').box.width).toBe(216);
  });

  it('moves rows after the first by nextLinePaddingX', () => {
    const src = 'C4Context\nUpdateLayoutConfig($c4ShapeInRow="1")\nSystem(a, "A")\nSystem(b, "B")';
    const layout = sound(src, { integrator: { c4: { nextLinePaddingX: 30 } } });
    expect(el(layout, 'b').box.x - el(layout, 'a').box.x).toBe(30);
  });

  it('sizes each boundary round its contents, header reserved inside the frame, siblings in rows of c4BoundaryInRow', () => {
    const src = [
      'C4Context',
      'Boundary(b1, "One", "kind") {',
      '  System(a, "A")',
      '  Boundary(inner, "Inner") {',
      '    System(c, "C")',
      '  }',
      '}',
      'Boundary(b2, "Two") {',
      '  System(b, "B")',
      '}',
      'Boundary(b3, "Three") {',
      '  System(d, "D")',
      '}',
    ].join('\n');
    const layout = sound(src);
    const one = frame(layout, 'b1');
    expect(textOf(one.type!)).toBe('[kind]');
    expect(el(layout, 'a').box.y).toBeGreaterThanOrEqual(one.box.y + one.head);
    expect(frame(layout, 'inner').box.y).toBeGreaterThan(bottom(el(layout, 'a').box));
    expect(frame(layout, 'inner').depth).toBe(1);
    // Two per row by default: b3 starts the second row.
    expect(frame(layout, 'b2').box.y).toBe(one.box.y);
    expect(frame(layout, 'b3').box.x).toBe(one.box.x);
    expect(frame(layout, 'b3').box.y).toBeGreaterThan(bottom(one.box));
  });

  it('draws a boundary on a parent cycle at the top level, with one C4_BOUNDARY_CYCLE', () => {
    const src = [
      'C4Context',
      'Boundary(a, "A") {',
      '  Boundary(b, "B") {',
      '    Boundary(a, "A again") {',
      '      Person(p, "P")',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const warnings: Warning[] = [];
    const { model, layout } = lay(src, { warnings });
    expect(model.boundaries.map((b) => model.boundaries[b.parent]?.alias)).toEqual(['b', 'a']);
    expect(c4LayoutViolations(model, layout)).toEqual([]);
    expect(layout.boundaries.map((b) => [b.alias, b.parent])).toEqual([
      ['a', -1],
      ['b', 0],
    ]);
    expect(warnings.map((w) => w.code)).toEqual([C4_BOUNDARY_CYCLE]);
    expect(warnings[0]!.astIds).toEqual([model.boundaries[0]!.ast]);
  });
});

describe('c4 direction: the fill order of the grid (#730, amends D452)', () => {
  const SHAPES = ['a', 'b', 'c', 'd', 'e', 'f'];
  const placed = (name: string) => sound(fixtureSource(`pr-check/direction-${name}`));
  /** The aliases of `layout`'s elements grouped by the value `key` gives, groups in key order. */
  const lines = (layout: C4Layout, aliases: string[], key: (r: Rect) => number): string[][] => {
    const by = new Map<number, string[]>();
    for (const alias of aliases) {
      const at = key(el(layout, alias).box);
      by.set(at, [...(by.get(at) ?? []), alias]);
    }
    return [...by.entries()].sort(([x], [y]) => x - y).map(([, group]) => group);
  };
  const byX = (r: Rect) => r.x;
  const byY = (r: Rect) => r.y;
  /** Each alias of a line, ordered along the other axis. */
  const along = (layout: C4Layout, group: string[], key: (r: Rect) => number): string[] =>
    [...group].sort((p, q) => key(el(layout, p).box) - key(el(layout, q).box));

  it('lays the TB fixture out in rows, the lines down, the boundary below', () => {
    const layout = placed('tb');
    expect(lines(layout, SHAPES, byY)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
    expect(along(layout, ['a', 'b', 'c'], byX)).toEqual(['a', 'b', 'c']);
    expect(frame(layout, 'g').box.y).toBeGreaterThan(bottom(el(layout, 'f').box));
  });

  it('is the TB fixture without its direction line, to the pixel', () => {
    const src = fixtureSource('pr-check/direction-tb');
    const plain = src.replace('direction TB\n', '');
    expect(plain).not.toBe(src);
    expect(JSON.stringify(lay(src).layout)).toBe(JSON.stringify(lay(plain).layout));
  });

  it('lays the LR fixture out as the TB one transposed: its rows are columns, its lines go right', () => {
    const tb = placed('tb');
    const lr = placed('lr');
    // The line of the TB fixture's row is the LR fixture's column.
    expect(lines(lr, SHAPES, byX)).toEqual(lines(tb, SHAPES, byY));
    // Members of a line run top to bottom, in statement order.
    for (const line of [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]) {
      expect(along(lr, line, byY)).toEqual(line);
      expect(new Set(line.map((alias) => el(lr, alias).box.x)).size).toBe(1);
    }
    // The boundary sits right of the elements instead of below them.
    expect(frame(lr, 'g').box.x).toBeGreaterThan(right(el(lr, 'f').box));
  });

  it('lays RL out as LR with the lines reversed, the boundary on the left', () => {
    const lr = placed('lr');
    const rl = placed('rl');
    expect(lines(rl, SHAPES, byX)).toEqual(lines(lr, SHAPES, byX).reverse());
    for (const line of [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]) {
      expect(along(rl, line, byY)).toEqual(line);
    }
    expect(right(frame(rl, 'g').box)).toBeLessThan(el(rl, 'a').box.x + el(rl, 'a').box.width);
    expect(frame(rl, 'g').box.x).toBeLessThan(el(rl, 'a').box.x);
  });

  it('lays BT out as TB with the lines reversed, the boundary above', () => {
    const tb = placed('tb');
    const bt = placed('bt');
    expect(lines(bt, SHAPES, byY)).toEqual(lines(tb, SHAPES, byY).reverse());
    for (const line of [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]) {
      expect(along(bt, line, byX)).toEqual(line);
    }
    expect(bottom(frame(bt, 'g').box)).toBeLessThan(el(bt, 'a').box.y + el(bt, 'a').box.height);
    expect(frame(bt, 'g').box.y).toBeLessThan(el(bt, 'd').box.y);
  });

  it('keeps the same elements, relations and boundary in every direction', () => {
    for (const name of ['lr', 'rl', 'bt']) {
      const layout = placed(name);
      expect(layout.elements.map((e) => e.alias)).toEqual(
        placed('tb').elements.map((e) => e.alias)
      );
      expect(layout.relations.map((r) => `${r.from}>${r.to}`)).toEqual(['a>d', 'c>h']);
    }
  });

  it('gives a boundary its own order, inherited by the boundaries in it, the last statement winning', () => {
    const layout = placed('boundary');
    // The top level is TB: a and b are a row.
    expect(el(layout, 'a').box.y).toBe(el(layout, 'b').box.y);
    // `outer` is LR (its last statement): c and d fill a column, e starts the next.
    expect(el(layout, 'c').box.x).toBe(el(layout, 'd').box.x);
    expect(el(layout, 'd').box.y).toBeGreaterThan(el(layout, 'c').box.y);
    expect(el(layout, 'e').box.x).toBeGreaterThan(el(layout, 'c').box.x);
    expect(el(layout, 'e').box.y).toBe(el(layout, 'c').box.y);
    // Its child boundaries sit right of its elements, and `inner` inherits LR: f and g in a column.
    expect(frame(layout, 'inner').box.x).toBeGreaterThan(right(el(layout, 'e').box));
    expect(el(layout, 'f').box.x).toBe(el(layout, 'g').box.x);
    expect(el(layout, 'g').box.y).toBeGreaterThan(el(layout, 'f').box.y);
    // `reset` says TB: i and j are a row, k below.
    expect(el(layout, 'i').box.y).toBe(el(layout, 'j').box.y);
    expect(el(layout, 'j').box.x).toBeGreaterThan(el(layout, 'i').box.x);
    expect(el(layout, 'k').box.y).toBeGreaterThan(bottom(el(layout, 'i').box));
    // c4BoundaryInRow is 1, so each child boundary is a column of its own, an X gap apart (a
    // gap keeps its physical axis: diagramMarginX, where TB's rows are a Y gap apart).
    expect(frame(layout, 'reset').box.x).toBe(right(frame(layout, 'inner').box) + 50);
    expect(frame(layout, 'reset').box.y).toBe(frame(layout, 'inner').box.y);
  });

  it('sizes an LR boundary to the taller of its elements and its child boundaries, not their sum', () => {
    const layout = placed('boundary');
    const outer = frame(layout, 'outer');
    const inside = ['c', 'd', 'e'].map((a) => bottom(el(layout, a).box));
    const kids = ['inner', 'reset'].map((a) => bottom(frame(layout, a).box));
    // c4ShapeMargin (50) below the lowest content, as every frame.
    expect(bottom(outer.box)).toBe(Math.max(...inside, ...kids) + 50);
  });

  it("takes the top level's direction for a boundary with none, wherever the statement is", () => {
    const src = (at: string) =>
      [
        'C4Context',
        at === 'first' ? 'direction LR' : '',
        'Boundary(b, "B") {',
        '  System(a, "A")',
        '  System(c, "C")',
        '}',
        at === 'last' ? 'direction LR' : '',
      ].join('\n');
    for (const at of ['first', 'last']) {
      const layout = sound(src(at));
      expect(el(layout, 'a').box.x).toBe(el(layout, 'c').box.x);
      expect(el(layout, 'c').box.y).toBeGreaterThan(el(layout, 'a').box.y);
    }
    const tb = sound(src('none'));
    expect(el(tb, 'a').box.y).toBe(el(tb, 'c').box.y);
  });
});

describe('c4 element text and shapes', () => {
  it('stacks the bold name, v12’s type line and the description, centred in the shape', () => {
    const layout = sound('C4Container\nContainerDb(db, "Store", "Postgres", "Keeps things")', {
      measurer: grid,
    });
    const db = el(layout, 'db');
    expect(db.shape).toBe('cyl');
    expect(db.name!.bold).toBe(true);
    expect(textOf(db.type!)).toBe('[Container: Postgres]');
    expect(db.type!.font.size).toBeCloseTo(14 * 0.75);
    expect(db.descr!.font.size).toBeCloseTo(14 * 0.82);
    expect(db.type!.y).toBeCloseTo(bottom(db.name!) + 3);
    expect(db.descr!.y).toBeCloseTo(bottom(db.type!) + 3);
    expect(db.name!.x + db.name!.width / 2).toBeCloseTo(db.box.x + db.box.width / 2);
  });

  it('names the type line by the base kind (external, db and queue dropped)', () => {
    const layout = sound(
      'C4Context\nPerson_Ext(p, "P")\nSystemQueue_Ext(q, "Q")\nComponent(c, "C")'
    );
    expect(['p', 'q', 'c'].map((a) => textOf(el(layout, a).type!))).toEqual([
      '[Person]',
      '[Software System]',
      '[Component]',
    ]);
    expect(['p', 'q', 'c'].map((a) => el(layout, a).shape)).toEqual(['person', 'h-cyl', 'rounded']);
  });

  it('wraps at width − 2·c4ShapePadding when c4.wrap, and not when it is off', () => {
    const src = 'C4Context\nSystem(s, "S", "' + 'word '.repeat(12) + '")';
    const wrapped = el(sound(src, { measurer: grid }), 's');
    expect(wrapped.descr!.text.lines.length).toBeGreaterThan(1);
    expect(wrapped.descr!.width).toBeLessThanOrEqual(176);
    expect(wrapped.box.width).toBe(216);
    const unwrapped = el(sound(src, { measurer: grid, integrator: { c4: { wrap: false } } }), 's');
    expect(unwrapped.descr!.text.lines).toHaveLength(1);
    expect(unwrapped.box.width).toBe(unwrapped.descr!.width + 40);
  });

  it('measures in the config font sizes and the theme font family', () => {
    const layout = sound('C4Context\nPerson(p, "P")', {
      integrator: { c4: { personFontSize: 20 } },
    });
    expect(el(layout, 'p').name!.font.size).toBe(20);
    expect(el(layout, 'p').name!.font.family).toBe(theme.value('fontFamily'));
  });

  it('takes the shape from $shape, $sprite or a $tags word before the kind', () => {
    const layout = sound(
      'C4Context\nSystem(a, "A", $tags="x,queue")\nSystem(b, "B", $sprite="Person")\nSystem(c, "C")\nUpdateElementStyle(c, $shape="component")'
    );
    expect(['a', 'b', 'c'].map((x) => el(layout, x).shape)).toEqual(['h-cyl', 'person', 'fr-rect']);
  });

  it('pads the cylinder, the queue and fr-rect with the theme’s shape rows: 2·pad classic, v12 neo’s in neo (D152)', async () => {
    const neo = createTheme(await loadTheme('neo'));
    // A 300 px name (30 characters) over a 110 px type line: text 300 × 32.4.
    const name = 'n'.repeat(30);
    const src = `C4Container\nContainerDb(c, "${name}")\nContainerQueue(q, "${name}")\nContainer(f, "${name}", $tags="component")`;
    const size = (t: Theme): number[][] => {
      const parsed = parsedC4(src);
      const layout = layoutC4(parsed.model, c4TestContext(parsed.config, t, [], grid));
      expect(c4LayoutViolations(parsed.model, layout)).toEqual([]);
      return ['c', 'q', 'f'].map((a) => [el(layout, a).box.width, el(layout, a).box.height]);
    };
    const round = (rows: number[][]): number[][] => rows.map((r) => r.map((v) => +v.toFixed(2)));
    // Cylinder: text + 2·20 (classic) or + 24 (neo), and three cap radii (12) taller.
    // Queue: half the cylinder's, ends of radius min(12, h/4) each side.
    // fr-rect: 2·20 (classic) or 28 × 12 (neo), and the two 8 px frames.
    expect(round(size(theme))).toEqual([
      [340, 108.4],
      [364, 72.4],
      [356, 72.4],
    ]);
    expect(round(size(neo))).toEqual([
      [324, 92.4],
      [334.2, 44.4],
      [344, 44.4],
    ]);
  });
});

describe('c4 relations (D455)', () => {
  it('goes straight where clear, its ends on both outlines', () => {
    const layout = sound('C4Context\nPerson(a, "A")\nSystem(b, "B")\nRel(a, b, "Uses", "HTTPS")');
    const r = rel(layout, 'a', 'b');
    expect(r.route).toBe('line');
    expect(r.points).toHaveLength(2);
    expect(r.endArrow).toBe(true);
    expect(r.startArrow).toBe(false);
    expect(r.techn!.italic).toBe(true);
    expect(r.techn!.y).toBeCloseTo(bottom(r.label!));
  });

  it('bends round a shape in the way', () => {
    const layout = sound(
      'C4Context\nSystem(a, "A")\nSystem(b, "B")\nSystem(c, "C")\nRel(a, c, "skips")'
    );
    const r = rel(layout, 'a', 'c');
    expect(r.route).toBe('bent');
    expect(c4RelationCrossings(layout)).toEqual([]);
  });

  describe('a diagonal that no elbow of two bends clears (#774)', () => {
    /** The stretches of a relation, each as its two ends. */
    const stretches = (r: C4RelationLayout): [Point, Point][] =>
      r.points.slice(1).map((q, k) => [r.points[k]!, q]);

    it.each([
      ['a1', 'c3'],
      ['a3', 'c1'],
    ])('goes round B2 from %s to %s, upright and level, its ends on both outlines', (from, to) => {
      const { model, config } = fixture('nightly-check/relationships/blocked-diagonal-relations');
      const layout = layoutC4(model, c4TestContext(config, theme));
      expect(c4LayoutViolations(model, layout)).toEqual([]);
      const r = rel(layout, from, to);
      expect(r.route).toBe('bent');
      for (const [p, q] of stretches(r)) expect(p.x === q.x || p.y === q.y).toBe(true);
      expect(c4RelationCrossings(layout)).toEqual([]);
      // a2 -> c2, upright past B2, keeps its detour: one lane beside B2.
      expect(rel(layout, 'a2', 'c2').points).toHaveLength(4);
    });

    it('takes the large diagram’s c5_0 -> c0_0 past c0_5 and c0_9, not through them', () => {
      const { model, config } = fixture('nightly-check/large-diagram');
      const layout = layoutC4(model, c4TestContext(config, theme));
      expect(layout.careful).toBe(true);
      expect(rel(layout, 'c5_0', 'c0_0').route).toBe('bent');
      expect(c4RelationCrossings(layout).filter((c) => c.startsWith('c5_0 -> c0_0'))).toEqual([]);
    });

    it('goes straight only once the work budget is spent (R-SEC-5)', () => {
      const { model, config } = fixture('nightly-check/relationships/blocked-diagonal-relations');
      const ctx = c4TestContext(config, theme);
      const tight = layoutC4(model, { ...ctx, limits: { ...DEFAULT_LIMITS, maxLayoutWork: 1 } });
      expect(tight.careful).toBe(false);
      expect(rel(tight, 'a1', 'c3').route).toBe('line');
      expect(c4LayoutViolations(model, tight)).toEqual([]);
    });
  });

  it('draws arrowheads as v12: Rel_Back at the start only, BiRel at both', () => {
    const layout = sound(
      'C4Context\nSystem(a, "A")\nSystem(b, "B")\nSystem(c, "C")\nRel_Back(a, b, "x")\nBiRel(b, c, "y")'
    );
    expect([rel(layout, 'a', 'b').startArrow, rel(layout, 'a', 'b').endArrow]).toEqual([
      true,
      false,
    ]);
    expect([rel(layout, 'b', 'c').startArrow, rel(layout, 'b', 'c').endArrow]).toEqual([
      true,
      true,
    ]);
  });

  it('shifts a reverse pair apart', () => {
    const layout = sound(
      'C4Context\nSystem(a, "A")\nSystem(b, "B")\nRel(a, b, "x")\nRel(b, a, "y")'
    );
    expect(rel(layout, 'a', 'b').start.y).not.toBeCloseTo(rel(layout, 'b', 'a').end.y);
    // Each to the left of its own way: `a -> b` runs right, so below; `b -> a` above.
    expect(rel(layout, 'a', 'b').start.y).toBeGreaterThan(rel(layout, 'b', 'a').end.y);
  });

  describe('relations that repeat a pair (#680)', () => {
    const repeated = (head: string, n: number): string =>
      head + Array.from({ length: n }, (_, i) => `Rel(a, b, "r${i}")\n`).join('');
    const ROW = 'C4Context\nSystem(a, "A")\nSystem(b, "B")\n';
    const COLUMN =
      'C4Context\nUpdateLayoutConfig($c4ShapeInRow="1")\nSystem(a, "A")\nSystem(b, "B")\n';
    const DIAGONAL =
      'C4Context\nUpdateLayoutConfig($c4ShapeInRow="2")\nSystem(a, "A")\nSystem(x, "X")\nSystem(y, "Y")\nSystem(b, "B")\n';
    const NESTED = 'C4Context\nBoundary(a, "A") {\nSystem(b, "B")\n}\n';
    /**
     * More lines than fit `2 * pairShift` apart between two systems side by side (4), fewer than
     * fit `near` apart (10).
     */
    const SQUEEZED = 8;
    /** More lines than fit `near` apart between two systems side by side. */
    const PAST_ROOM = 12;
    /** More lines than fit `2 * pairShift` apart across a system's width (15). */
    const PAST_WIDTH = 24;
    /** Rounding in the shift arithmetic, far below a pixel. */
    const ROUNDING = 1e-9;
    /** Each straight line's offset across the first one's direction, in order, and the gaps. */
    const across = (layout: C4Layout): { offsets: number[]; gaps: number[] } => {
      const lines = layout.relations.filter((r) => r.from === 'a' && r.to === 'b');
      expect(lines.every((r) => r.route === 'line')).toBe(true);
      const [p, q] = lines[0]!.points as [Point, Point];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const [nx, ny] = [-(q.y - p.y) / len, (q.x - p.x) / len];
      const offsets = lines.map((r) => (r.start.x - p.x) * nx + (r.start.y - p.y) * ny);
      const sorted = [...offsets].sort((u, v) => u - v);
      return { offsets, gaps: sorted.slice(1).map((o, i) => o - sorted[i]!) };
    };

    it.each([
      ['side by side', ROW],
      ['one above the other', COLUMN],
      ['diagonally apart', DIAGONAL],
      ['one inside the other', NESTED],
    ])('keeps each line between shapes %s at least `near` from the next', (_name, head) => {
      const { gaps } = across(sound(repeated(head, SQUEEZED)));
      expect(gaps).toHaveLength(SQUEEZED - 1);
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(M.near - ROUNDING);
    });

    it('spreads them across in statement order', () => {
      const { offsets } = across(sound(repeated(ROW, SQUEEZED)));
      const steps = offsets.slice(1).map((o, i) => Math.sign(o - offsets[i]!));
      expect(new Set(steps).size).toBe(1);
      expect(steps[0]).not.toBe(0);
    });

    it('limit: past the room the pair shares, keeps them evenly apart, closer than `near`', () => {
      const { gaps } = across(sound(repeated(ROW, PAST_ROOM)));
      expect(gaps).toHaveLength(PAST_ROOM - 1);
      for (const gap of gaps) expect(Math.abs(gap - gaps[0]!)).toBeLessThan(ROUNDING);
      expect(gaps[0]).toBeGreaterThan(0);
      expect(gaps[0]).toBeLessThan(M.near);
    });

    it('limit: puts the outermost lines `portInset` inside the side two shapes share', () => {
      const layout = sound(repeated(ROW, PAST_ROOM));
      const box = el(layout, 'a').box;
      const ys = layout.relations.map((r) => r.start.y);
      expect(Math.min(...ys)).toBeCloseTo(box.y + M.portInset, 9);
      expect(Math.max(...ys)).toBeCloseTo(bottom(box) - M.portInset, 9);
    });

    it('limit: between shapes diagonally apart, as far as each middle moves across the line', () => {
      const layout = sound(repeated(DIAGONAL, PAST_ROOM));
      const [a, b] = [el(layout, 'a').box, el(layout, 'b').box];
      const middle = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
      const [p, q] = [middle(a), middle(b)];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const [nx, ny] = [-(q.y - p.y) / len, (q.x - p.x) / len];
      // From the middle across the line, out through a straight side (clear of the corners here).
      const out = (r: Rect): number =>
        Math.min(r.width / 2 / Math.abs(nx), r.height / 2 / Math.abs(ny));
      const room = Math.min(out(a), out(b)) - M.portInset;
      const offsets = layout.relations.map((r) => (r.start.x - p.x) * nx + (r.start.y - p.y) * ny);
      expect(Math.max(...offsets)).toBeCloseTo(room, 6);
      expect(Math.min(...offsets)).toBeCloseTo(-room, 6);
    });

    it('limit: between cylinders side by side, out through their rounded ends', () => {
      const layout = sound(
        repeated('C4Context\nContainerDb(a, "A", "SQL")\nContainerDb(b, "B", "SQL")\n', PAST_ROOM)
      );
      const box = el(layout, 'a').box;
      const ys = layout.relations.map((r) => r.start.y);
      expect(Math.min(...ys)).toBeCloseTo(box.y + M.portInset, 9);
      expect(Math.max(...ys)).toBeCloseTo(bottom(box) - M.portInset, 9);
    });

    /** Where each relation between a boundary and the shape in it crosses the side it leaves. */
    const alongSide = (layout: C4Layout): { at: number[]; inner: [number, number] } => {
      const inner = el(layout, 'b').box;
      const upright = layout.relations.every((r) => r.start.x === r.end.x);
      expect(upright || layout.relations.every((r) => r.start.y === r.end.y)).toBe(true);
      return {
        at: layout.relations.map((r) => (upright ? r.start.x : r.start.y)),
        inner: upright ? [inner.x, right(inner)] : [inner.y, bottom(inner)],
      };
    };

    it('limit: inside a boundary, along the side it leaves, `portInset` inside the shape', () => {
      const { at, inner } = alongSide(sound(repeated(NESTED, PAST_WIDTH)));
      expect(Math.min(...at)).toBeCloseTo(inner[0] + M.portInset, 9);
      expect(Math.max(...at)).toBeCloseTo(inner[1] - M.portInset, 9);
    });

    it.each([
      ['into the shape', 'Rel(a, b, "in")'],
      ['out of the shape', 'Rel(b, a, "out")'],
    ])('limit: from the side of a boundary nearest the shape, the first one %s', (_way, first) => {
      // The person beside the system leaves the frame's bottom farther from it than its left.
      const head = `C4Context\nBoundary(a, "A") {\nSystem(b, "B")\nPerson(p, "P")\n}\n${first}\n`;
      const layout = sound(repeated(head, PAST_ROOM - 1));
      const { at, inner } = alongSide(layout);
      for (const r of layout.relations)
        expect(r.from === 'a' ? r.start.x : r.end.x).toBeCloseTo(frame(layout, 'a').box.x, 9);
      expect(Math.min(...at)).toBeCloseTo(inner[0] + M.portInset, 9);
      expect(Math.max(...at)).toBeCloseTo(inner[1] - M.portInset, 9);
    });

    it('spreads them in statement order inside a boundary, either way', () => {
      const { at } = alongSide(
        sound(
          'C4Context\nBoundary(a, "A") {\nSystem(b, "B")\n}\nRel(a, b, "1")\nRel(a, b, "2")\nRel(b, a, "3")'
        )
      );
      const steps = at.slice(1).map((o, i) => Math.sign(o - at[i]!));
      expect(new Set(steps).size).toBe(1);
      expect(steps[0]).not.toBe(0);
    });
  });

  describe('self-loops that repeat a shape (#680)', () => {
    /** More loops than fit their ends `near` apart on a system's right side (5). */
    const PAST_ROOM = 7;
    const loops = (src: string): C4RelationLayout[] =>
      sound(src).relations.filter((r) => r.route === 'loop');
    /** Where each loop meets the outline, in order down the side, and the gaps between them. */
    const ends = (drawn: readonly C4RelationLayout[]): { ys: number[]; gaps: number[] } => {
      const ys = drawn.flatMap((r) => [r.start.y, r.end.y]).sort((u, v) => u - v);
      return { ys, gaps: ys.slice(1).map((y, i) => y - ys[i]!) };
    };

    it('draws each on its own stretch of the side, its arrowheads apart from the others', () => {
      const drawn = loops('C4Context\nSystem(a, "A")\nRel(a, a, "one")\nBiRel(a, a, "two")');
      expect(drawn).toHaveLength(2);
      const [one, two] = drawn as [C4RelationLayout, C4RelationLayout];
      // The first statement above the second, each loop's ends on its own stretch.
      expect(Math.max(one.start.y, one.end.y)).toBeLessThan(Math.min(two.start.y, two.end.y));
      for (const gap of ends(drawn).gaps) expect(gap).toBeGreaterThanOrEqual(M.near);
    });

    it('limit: past the room on the side, keeps their ends evenly apart, closer than `near`', () => {
      const src = Array.from({ length: PAST_ROOM }, (_, i) => `Rel(a, a, "r${i}")`).join('\n');
      const { ys, gaps } = ends(loops(`C4Context\nSystem(a, "A")\n${src}`));
      expect(new Set(ys).size).toBe(2 * PAST_ROOM);
      for (const gap of gaps) expect(Math.abs(gap - gaps[0]!)).toBeLessThan(1e-9);
      expect(gaps[0]).toBeLessThan(M.near);
      // They fill the side, `loopSpreadInset` clear of its ends.
      const box = el(sound(`C4Context\nSystem(a, "A")\n${src}`), 'a').box;
      expect(ys[0]).toBeCloseTo(box.y + M.loopSpreadInset, 9);
      expect(ys[ys.length - 1]).toBeCloseTo(bottom(box) - M.loopSpreadInset, 9);
    });

    it('keeps a lone loop at the middle of the box, also on a person', () => {
      const layout = sound('C4Context\nPerson(a, "A")\nRel(a, a, "self")');
      const r = rel(layout, 'a', 'a');
      const box = el(layout, 'a').box;
      expect((r.start.y + r.end.y) / 2).toBeCloseTo(box.y + box.height / 2, 9);
    });

    it('ends the loops on a person on its body, at its right side, not on its head', () => {
      const layout = sound('C4Context\nPerson(a, "A")\nRel(a, a, "one")\nBiRel(a, a, "two")');
      const box = el(layout, 'a').box;
      for (const r of loops('C4Context\nPerson(a, "A")\nRel(a, a, "one")\nBiRel(a, a, "two")'))
        for (const end of [r.start, r.end])
          expect(end.x).toBeGreaterThanOrEqual(right(box) - M.shapeRadius);
      expect(layout.relations).toHaveLength(2);
    });
  });

  it('numbers C4Dynamic relations in model order, and leaves out one with an unknown end', () => {
    const layout = sound(
      'C4Dynamic\nSystem(a, "A")\nSystem(b, "B")\nRel(a, b, "first")\nRel(a, zz, "lost")\nRel(b, a, "third")'
    );
    expect(layout.relations.map((r) => textOf(r.label!))).toEqual(['1: first', '3: third']);
  });

  it('ends a relation to a boundary on its frame, and one from inside it at its nearest side', () => {
    const layout = sound(
      'C4Context\nBoundary(b, "B") {\n  System(s, "S")\n}\nSystem(x, "X")\nRel(b, x, "out")\nRel(s, b, "in")'
    );
    // x is on the top level's row, above the boundary: the line leaves the frame's top.
    expect(rel(layout, 'b', 'x').start.y).toBeCloseTo(frame(layout, 'b').box.y);
    expect(rel(layout, 's', 'b').points).toHaveLength(2);
  });

  it('moves a label by UpdateRelStyle offsets when no spot on the line covers less', () => {
    const src = 'C4Context\nSystem(a, "A")\nSystem(b, "B")\nRel(a, b, "x")';
    // From the element's top: the canvas grows for the moved label.
    const labelTop = (layout: C4Layout): number =>
      rel(layout, 'a', 'b').label!.y - el(layout, 'a').box.y;
    expect(labelTop(sound(src + '\nUpdateRelStyle(a, b, $offsetY="-40")'))).toBeCloseTo(
      labelTop(sound(src)) - 40
    );
  });

  it('builds the path with rounded corners, trimmed under the arrowheads', () => {
    const layout = sound(
      'C4Context\nSystem(a, "A")\nSystem(b, "B")\nSystem(c, "C")\nRel(a, c, "skips")'
    );
    const r = rel(layout, 'a', 'c');
    const path = c4RelationPath(r, 0, 10);
    expect(path.filter((c) => c.op === 'Q')).toHaveLength(r.points.length - 2);
    const last = path[path.length - 1]! as { x: number; y: number };
    expect(Math.hypot(last.x - r.end.x, last.y - r.end.y)).toBeCloseTo(10);
  });

  it('counts its comparisons: once 2,000,000 are spent, the relations left go straight (R-SEC-5)', () => {
    const n = 800;
    const lines = ['C4Context'];
    for (let i = 0; i < n; i++) lines.push(`System(s${i}, "S${i}")`);
    for (let i = 0; i < n; i++) lines.push(`Rel(s${i}, s${(i * 7 + 3) % n}, "r${i}")`);
    const { model, config, layout } = lay(lines.join('\n'));
    expect(layout.careful).toBe(false);
    // The first relations are routed with care; past the budget every one is straight.
    const lastBent = layout.relations.map((r) => r.route).lastIndexOf('bent');
    expect(lastBent).toBeGreaterThan(0);
    expect(lastBent).toBeLessThan(n - 1);
    expect(layout.relations.slice(lastBent + 1).every((r) => r.route !== 'bent')).toBe(true);
    expect(c4LayoutViolations(model, layout)).toEqual([]);
    // Counted, not timed: the same layout every time.
    expect(layoutC4(model, c4TestContext(config, theme))).toEqual(layout);
  });

  it('spends no more than the integrator’s maxLayoutWork (D542)', () => {
    const src = 'C4Context\nSystem(a, "A")\nSystem(b, "B")\nSystem(c, "C")\nRel(a, c, "skips")';
    const { model, config } = parsedC4(src);
    const ctx = c4TestContext(config, theme);
    expect(layoutC4(model, ctx).careful).toBe(true);
    const tight = layoutC4(model, { ...ctx, limits: { ...DEFAULT_LIMITS, maxLayoutWork: 0 } });
    expect(tight.careful).toBe(false);
    expect(rel(tight, 'a', 'c').route).toBe('line');
  });
});

/**
 * The root `wrap`, when set, wins over `c4.wrap` (#683, as v12's fix mermaid-js/mermaid#8342;
 * 12.2.0's elements followed `c4.wrap` alone). Relation and boundary text wraps only when the
 * root `wrap` is `true`, as v12.
 */
describe('c4 wrapping (the root wrap wins over c4.wrap; relations and boundaries need it)', () => {
  const long = 'word '.repeat(30).trim();
  const src = [
    'C4Context',
    `Boundary(b, "${long}") {`,
    `  System(s, "S", "${long}")`,
    '}',
    'System(t, "T")',
    `Rel(s, t, "${long}")`,
  ].join('\n');

  it.each([
    [false, false, false, false],
    [false, true, false, false],
    [true, false, true, true],
    [true, true, true, true],
    [undefined, false, false, false],
    [undefined, true, false, true],
  ])(
    'root wrap %s, c4.wrap %s: relation and boundary text wrap %s, element text %s',
    (root, c4, both, element) => {
      const integrator =
        root === undefined ? { c4: { wrap: c4 } } : { wrap: root, c4: { wrap: c4 } };
      const layout = sound(src, { measurer: grid, integrator });
      const lines = (l: PlacedLabel | undefined): number => l!.text.lines.length;
      expect(lines(rel(layout, 's', 't').label) > 1).toBe(both);
      expect(lines(frame(layout, 'b').label) > 1).toBe(both);
      expect(lines(el(layout, 's').descr) > 1).toBe(element);
    }
  );

  it('keeps an element at its natural width under the root wrap: false (#683)', () => {
    const one = 'C4Context\nSystem(s, "S", "' + 'word '.repeat(12).trim() + '")';
    const wrapped = el(sound(one, { measurer: grid }), 's');
    expect(wrapped.box.width).toBe(216);
    const unwrapped = el(sound(one, { measurer: grid, integrator: { wrap: false } }), 's');
    expect(unwrapped.descr!.text.lines).toHaveLength(1);
    expect(unwrapped.box.width).toBe(unwrapped.descr!.width + 40);
    expect(unwrapped.box.width).toBeGreaterThan(216);
  });
});

/**
 * The person keeps c4model.com's proportions (#683, as v12's fix mermaid-js/mermaid#8322):
 * 12.2.0's head was a fixed 13 px in a 26 px row over a body as tall as its text, so a one-line
 * person was a small head on a wide flat box.
 */
describe('c4 person figure (#683)', () => {
  const person = (src: string, alias = 'p') => {
    const layout = sound(src, { measurer: grid });
    const e = el(layout, alias);
    const r = Math.min(80, Math.max(16, e.box.width * 0.23));
    const neck = 2 * r - 0.27 * r;
    return { layout, e, r, body: { top: e.box.y + neck, height: e.box.height - neck } };
  };

  it('keeps the body at least 0.6 times as tall as it is wide for a one-line label', () => {
    const { e, r, body } = person('C4Context\nPerson(p, "P")');
    expect(e.box.width).toBe(216);
    expect(r).toBeCloseTo(49.68, 9);
    expect(body.height).toBeGreaterThanOrEqual(0.6 * e.box.width - 1e-9);
  });

  it('centres the text on the part of the body the head does not cover', () => {
    const { e, r, body } = person('C4Context\nPerson(p, "P", "A customer")');
    const top = e.name!.y;
    const end = bottom(e.descr!);
    expect(top).toBeGreaterThanOrEqual(e.box.y + 2 * r - 1e-9);
    expect(top - (e.box.y + 2 * r)).toBeCloseTo(body.top + body.height - end, 6);
  });

  it('grows the body to fit a long text below the head', () => {
    const long = 'word '.repeat(80).trim();
    const { e, r, body } = person(`C4Context\nPerson(p, "P", "${long}")`);
    expect(e.descr!.text.lines.length).toBeGreaterThan(5);
    expect(e.name!.y).toBeGreaterThanOrEqual(e.box.y + 2 * r - 1e-9);
    expect(bottom(e.descr!)).toBeLessThanOrEqual(body.top + body.height + 1e-9);
  });

  it('scales the head with the width, up to 80', () => {
    const wide = person(`C4Context\nPerson(p, "${'x'.repeat(60)}")`, 'p');
    expect(wide.e.box.width).toBeGreaterThan(400);
    expect(wide.r).toBe(80);
  });

  it('keeps a relation end on the head and body outline', () => {
    // `sound` runs the invariants: every end on its outline.
    person('C4Context\nPerson(p, "P")\nSystem(s, "S")\nRel(s, p, "uses")\nRel(p, s, "pays")');
  });
});

describe('c4 global (D454)', () => {
  it('draws Boundary(global, …) as an ordinary boundary', () => {
    const layout = sound(
      'C4Context\nBoundary(global, "G") {\n  Person(a, "A")\n}\nSystem(s, "S")\nRel(s, global, "in")'
    );
    const g = frame(layout, 'global');
    expect(g.parent).toBe(-1);
    expect(textOf(g.label!)).toBe('G');
    expect(el(layout, 'a').box.y).toBeGreaterThan(g.box.y + g.head);
    expect(rel(layout, 's', 'global').end.y).toBeCloseTo(g.box.y);
  });
});

describe('c4 title and canvas (D224, D453)', () => {
  it('puts the title in a row above the contents, inside the bounds', () => {
    const layout = sound('C4Context\ntitle A title\nSystem(a, "A")');
    expect(bottom(layout.title!)).toBeLessThanOrEqual(el(layout, 'a').box.y);
    expect(el(layout, 'a').box.y).toBe(10 + 60);
    expect(layout.title!.font.size).toBe(16);
  });

  it('draws the front-matter title when the text has none', () => {
    const parsed = fixture('nightly-check/titles');
    const drawn = layoutC4(parsed.model, c4TestContext(parsed.config, theme));
    expect(textOf(drawn.title!)).toBe('Front-matter title');
  });

  it('lays out an empty diagram as the margins alone', () => {
    const layout = sound('C4Context\ntitle\n');
    expect([layout.width, layout.height]).toEqual([100, 20]);
  });
});

describe('c4 layout checker', () => {
  const base = () => lay(sourceOf2());

  it('catches overlapping elements, an element outside its boundary, NaN and an end off its outline', () => {
    const { model, layout } = base();
    const [first, second, ...rest] = layout.elements;
    const stacked = { ...layout, elements: [first!, { ...second!, box: first!.box }, ...rest] };
    expect(c4LayoutViolations(model, stacked).join()).toMatch(/overlap/);
    const inner = layout.elements.find((e) => model.elements[e.index]!.parent >= 0)!;
    const outside = layout.elements.map((e) =>
      e === inner ? { ...e, box: { ...e.box, x: -500 } } : e
    );
    expect(c4LayoutViolations(model, { ...layout, elements: outside }).join()).toMatch(
      /outside boundary/
    );
    const nan = { ...layout, width: Number.NaN };
    expect(c4LayoutViolations(model, nan)).toEqual(['layout.width is NaN']);
    const [r, ...others] = layout.relations;
    const off = { ...r!, start: { ...r!.start, y: r!.start.y - 30 } };
    expect(c4LayoutViolations(model, { ...layout, relations: [off, ...others] }).join()).toMatch(
      /not on the outline/
    );
  });

  it('catches an element on a frame it is not in', () => {
    const { model, layout } = lay(sourceOf2());
    const frameBox = layout.boundaries[0]!.box;
    const outsider = layout.elements.find((e) => model.elements[e.index]!.parent < 0)!;
    const moved = layout.elements.map((e) =>
      e === outsider ? { ...e, box: { ...e.box, x: frameBox.x, y: frameBox.y } } : e
    );
    expect(c4LayoutViolations(model, { ...layout, elements: moved }).join()).toMatch(
      /element x overlaps boundary c, which it is not in/
    );
  });

  it('catches a header outside its frame, contents outside the bounds, and overlapping siblings', () => {
    const { model, layout } = lay(
      'C4Context\nBoundary(a, "A") {\nSystem(x, "X")\n}\nBoundary(b, "B") {\nSystem(y, "Y")\n}'
    );
    const [a, b] = layout.boundaries;
    const high = { ...a!, label: { ...a!.label!, y: a!.box.y - 30 } };
    expect(c4LayoutViolations(model, { ...layout, boundaries: [high, b!] }).join()).toMatch(
      /header is outside/
    );
    const shrunk = { ...layout, bounds: { ...layout.bounds, width: 10 } };
    expect(c4LayoutViolations(model, shrunk).join()).toMatch(/outside the bounds/);
    const piled = { ...layout, boundaries: [a!, { ...b!, box: a!.box }] };
    expect(c4LayoutViolations(model, piled).join()).toMatch(/boundaries a and b overlap/);
  });
});

function sourceOf2(): string {
  return 'C4Container\nSystem(x, "X")\nContainer_Boundary(c, "C") {\n  Container(a, "A")\n  Container(b, "B")\n}\nRel(x, a, "uses")';
}
