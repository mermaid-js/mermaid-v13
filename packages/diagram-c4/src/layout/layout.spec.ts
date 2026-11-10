import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import { DEFAULT_LIMITS } from '@mermaid-js/core/limits';
import type { Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { C4_BOUNDARY_CYCLE } from '../codes.ts';
import { c4TestContext, parsedC4 } from '../test-context.ts';
import { c4LayoutViolations, c4RelationCrossings } from './invariants.ts';
import { layoutC4 } from './layout.ts';
import { c4RelationPath } from './path.ts';
import { fixture, FIXTURES } from './mmd.fixtures.ts';
import type { C4Layout, C4RelationLayout, PlacedLabel, Rect } from './types.ts';

/**
 * The C4 layout (spec #522 T3) through its seam, `layoutC4(model, ctx)`, on parser-produced
 * sources (R-LAYOUT-3): the invariants hold on every e2e fixture and the docs examples, and the
 * grid (D454), the router (D455), the text and the title do what the spec asks.
 */
let theme: Theme;
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'));
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
 * Relations that cross an element on the e2e fixtures (the spec allows listed exceptions): in
 * the large diagram, a line between boundaries finds no free elbow of two bends (Pele's router
 * tries none with more) and goes straight.
 */
const CROSSING_EXCEPTIONS = [
  'nightly-check/large-diagram: c1_0 -> c2_0 crosses c0_7',
  'nightly-check/large-diagram: c3_0 -> c4_0 crosses c2_7',
  'nightly-check/large-diagram: c5_0 -> c0_0 crosses c0_5',
  'nightly-check/large-diagram: c5_0 -> c0_0 crosses c0_9',
  'nightly-check/large-diagram: c5_0 -> c0_0 crosses c2_2',
  'nightly-check/large-diagram: c5_0 -> c0_0 crosses c2_7',
];

describe('c4 layout invariants on the e2e fixtures', () => {
  it('finds the fixtures, the five docs files (the six syntax-page examples) among them', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(46);
    expect(FIXTURES.filter((f) => f.startsWith('nightly-check/docs/'))).toHaveLength(5);
  });

  it.each(FIXTURES)('hold on %s', (path) => {
    const { model, config } = fixture(path);
    for (const measurer of [undefined, grid]) {
      const layout = layoutC4(model, c4TestContext(config, theme, [], measurer));
      expect(c4LayoutViolations(model, layout)).toEqual([]);
      // Every label found a spot off its own arrowheads, the elements and the headers (#542),
      // so the label invariant held for each, none excused as crowded.
      expect(layout.relations.filter((r) => r.crowded).map((r) => `${r.from} -> ${r.to}`)).toEqual(
        []
      );
    }
  });

  it('cross no element but the listed relations', () => {
    let relations = 0;
    const crossings = FIXTURES.flatMap((path) => {
      const { model, config } = fixture(path);
      const layout = layoutC4(model, c4TestContext(config, theme));
      relations += layout.relations.length;
      return c4RelationCrossings(layout).map((c) => `${path}: ${c}`);
    });
    expect(relations).toBeGreaterThan(130);
    expect(crossings).toEqual(CROSSING_EXCEPTIONS);
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

describe('c4 element text and shapes', () => {
  it('stacks the bold name, v12’s type line and the description, centred in the shape', () => {
    const layout = sound('C4Container\nContainerDb(db, "Store", "Postgres", "Keeps things")', {
      measurer: grid,
    });
    const db = el(layout, 'db');
    expect(db.shape).toBe('cyl');
    expect(db.name!.bold).toBe(true);
    expect(textOf(db.type)).toBe('[Container: Postgres]');
    expect(db.type.font.size).toBeCloseTo(14 * 0.75);
    expect(db.descr!.font.size).toBeCloseTo(14 * 0.82);
    expect(db.type.y).toBeCloseTo(bottom(db.name!) + 3);
    expect(db.descr!.y).toBeCloseTo(bottom(db.type) + 3);
    expect(db.name!.x + db.name!.width / 2).toBeCloseTo(db.box.x + db.box.width / 2);
  });

  it('names the type line by the base kind (external, db and queue dropped)', () => {
    const layout = sound(
      'C4Context\nPerson_Ext(p, "P")\nSystemQueue_Ext(q, "Q")\nComponent(c, "C")'
    );
    expect(['p', 'q', 'c'].map((a) => textOf(el(layout, a).type))).toEqual([
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
  });

  it('draws a self-loop on the right side', () => {
    const layout = sound('C4Context\nSystem(a, "A")\nRel(a, a, "self")');
    const r = rel(layout, 'a', 'a');
    expect(r.route).toBe('loop');
    expect(r.controls![0].x).toBeGreaterThan(right(el(layout, 'a').box));
    expect(c4RelationPath(r).map((c) => c.op)).toEqual(['M', 'C']);
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

describe('c4 wrapping (v12: relations and boundaries need the root wrap and c4.wrap)', () => {
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
    [false, false, false],
    [false, true, false],
    [true, false, false],
    [true, true, true],
  ])('root wrap %s, c4.wrap %s: relation and boundary text wrap %s', (root, c4, both) => {
    const layout = sound(src, { measurer: grid, integrator: { wrap: root, c4: { wrap: c4 } } });
    const lines = (l: PlacedLabel | undefined): number => l!.text.lines.length;
    expect(lines(rel(layout, 's', 't').label) > 1).toBe(both);
    expect(lines(frame(layout, 'b').label) > 1).toBe(both);
    // Element text follows c4.wrap alone.
    expect(lines(el(layout, 's').descr) > 1).toBe(c4);
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
