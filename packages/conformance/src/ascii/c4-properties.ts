import { beforeAll, describe, expect, it } from 'vitest';
import {
  ascii,
  cellWidth,
  graphemes,
  unicode,
  type CellRect,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
import type { C4Layout, PlacedLabel, Rect } from '@mermaid-js/diagram-c4';
import { c4AsciiDrawing, c4CellRect } from '@mermaid-js/diagram-c4/testing';
import { createMermaid, MermaidError } from 'mermaid';
import { renderC4Ascii, type C4AsciiResult, type C4Charset } from '../c4/ascii-render.ts';

// ASCII render properties of C4 and c4-beta (#545, D459, R-ASCII-9; spec #730 T7) over a corpus
// (legacy C4: e2e fixtures, v12 spec and syntax-page strings, the cases file; c4-beta: the
// probes, the grammar's documents with their variants, the e2e fixtures), in both charsets,
// through the public API: renders wherever SVG renders, deterministic, the drawing the hook's (`c4AsciiDrawing`, whose
// trimmed margin places the layout on the text), every element a whole box where the layout
// puts it and every boundary a whole frame, no two boxes on one cell and every element inside
// its frame, every label line present (an element's inside its box, a boundary's label in its
// top border, a relation's somewhere), an arrowhead outside the side of every end that has one,
// nothing but line glyphs and its own label on a frame (pitfall 20), no relation through an
// element or under header text, every label at or within 2 cells of its own line, `rows` lines
// none wider than `columns` and one exactly that wide, no trailing spaces, no Unicode glyph in
// ASCII.

/** The sources a suite draws. */
export type Sources = () => Promise<readonly { id: string; source: string }[]>;

/** A property's time on a loaded machine, in ms: it reads every drawing of the corpus. */
const CHECK_TIMEOUT = 60_000;

const CHARSETS: C4Charset[] = ['unicode', 'ascii'];

interface Case {
  id: string;
  out: Record<C4Charset, C4AsciiResult>;
  again: Record<C4Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};

async function load(sources: Sources): Promise<void> {
  cases.length = 0;
  for (const id of Object.keys(failed)) delete failed[id];
  const svg = createMermaid();
  svg.initialize({ deterministic: true });
  for (const item of await sources()) {
    try {
      await svg.render('c', item.source);
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
      continue; // SVG does not render it either
    }
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        out[charset] = await renderC4Ascii(item.source, charset);
        again[charset] = (await renderC4Ascii(item.source, charset)).text;
      }
      cases.push({ id: item.id, out, again });
    } catch (e) {
      failed[item.id] = String(e);
    }
  }
}

const perCharset = (check: (c: Case, charset: C4Charset) => unknown[]) => {
  const out: Record<string, unknown[]> = {};
  for (const c of cases) {
    const found = CHARSETS.flatMap((cs) => check(c, cs).map((p) => `${cs}: ${String(p)}`));
    if (found.length > 0) out[c.id] = found;
  }
  return out;
};

/** A line as cells: wide graphemes take two (the second `''`), zero-width ones join the cell before. */
function cellsOf(line: string): string[] {
  const out: string[] = [];
  for (const g of graphemes(line)) {
    if (g.width === 0) {
      if (out.length > 0) out[out.length - 1] += g.text;
      continue;
    }
    out.push(g.text);
    if (g.width === 2) out.push('');
  }
  return out;
}

/** The text as cells, and a layout box's cells on it. */
interface Grid {
  rows: string[][];
  cell(x: number, y: number): string;
  rect(r: Rect): CellRect;
}

function gridOf(text: string, layout: C4Layout, charset: C4Charset): Grid {
  const { left, top } = c4AsciiDrawing(layout, charset === 'ascii' ? ascii : unicode);
  const rows = text === '' ? [] : text.split('\n').map(cellsOf);
  return {
    rows,
    cell: (x, y) => rows[y]?.[x] ?? ' ',
    rect: (r) => {
      const c = c4CellRect(layout, r);
      return { ...c, x: c.x - left, y: c.y - top };
    },
  };
}

const linesOf = (label: PlacedLabel | undefined): string[] =>
  label ? label.text.lines.map((runs) => runs.map((r) => r.text).join('')) : [];

/** The glyphs a box's corners and sides may show: its own, or a tee where a line meets it. */
const BORDER = {
  unicode: { corner: '┌┐└┘╭╮╰╯╒╕╘╛╓╖╙╜', side: '│║┆├┤┬┴┼╞╡╤╧╟╢╥╨╪╫─═┄' },
  ascii: { corner: '+', side: '|I:+-=.' },
};
/** Every line glyph of both sets: what a frame's border may show besides its label. */
const LINE = /^[─-╿+\-|=I:.]$/u;

/** A box's corners and sides, as cells: corners first. */
function borderOf(r: CellRect): { corners: [number, number][]; sides: [number, number][] } {
  const right = r.x + r.width - 1;
  const bottom = r.y + r.height - 1;
  const sides: [number, number][] = [];
  for (let i = r.x + 1; i < right; i++) sides.push([i, r.y], [i, bottom]);
  for (let j = r.y + 1; j < bottom; j++) sides.push([r.x, j], [right, j]);
  return {
    corners: [
      [r.x, r.y],
      [right, r.y],
      [r.x, bottom],
      [right, bottom],
    ],
    sides,
  };
}

const inside = (a: CellRect, b: CellRect): boolean =>
  a.x > b.x && a.y > b.y && a.x + a.width < b.x + b.width && a.y + a.height < b.y + b.height;

const apart = (a: CellRect, b: CellRect): boolean =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

/** Is deterministic, and draws what the hook draws. */
const sameCheck = (c: Case, cs: C4Charset): unknown[] => {
  const { text, layout } = c.out[cs];
  const found: string[] = [];
  if (text !== c.again[cs]) found.push('differs');
  if (c4AsciiDrawing(layout, cs === 'ascii' ? ascii : unicode).text !== text)
    found.push('not the hook’s drawing');
  return found;
};

/** What a box's check reads: the drawing's cells, and whether a frame cell is a crowded label's. */
interface BoxEnv {
  readonly g: Grid;
  readonly cs: C4Charset;
  readonly underCrowded: (x: number, y: number) => boolean;
}

/** The cells of `at` whose glyph `allowed` does not hold, named as the box `name` has them. */
function wrongCells(
  env: BoxEnv,
  at: readonly (readonly [number, number])[],
  allowed: string,
  what: string
): string[] {
  return at
    .filter(([x, y]) => !allowed.includes(env.g.cell(x, y)))
    .map(([x, y]) => `${what} ${JSON.stringify(env.g.cell(x, y))} (${x}, ${y})`);
}

/** What is wrong with the corners and sides of the box `r` (a frame lets a crowded label cover). */
function borderProblems(
  env: BoxEnv,
  r: CellRect,
  name: string,
  label: string | undefined,
  frame: boolean
): string[] {
  const { g, cs, underCrowded } = env;
  const { corners, sides } = borderOf(r);
  // A frame cell under a crowded label is the label's; a frame's own label sits in its top border.
  const kept = (at: readonly (readonly [number, number])[], top: boolean) =>
    at.filter(([x, y]) => !(frame && underCrowded(x, y)) && !(top && label && y === r.y));
  const found = [
    ...wrongCells(env, kept(corners, false), BORDER[cs].corner, 'at a corner'),
    ...wrongCells(env, kept(sides, true), BORDER[cs].side, 'on a side'),
  ].map((problem) => `${name}: ${problem}`);
  const top = g.rows[r.y]?.slice(r.x, r.x + r.width).join('') ?? '';
  if (label && !top.includes(` ${label} `))
    found.push(`${name}: top border ${JSON.stringify(top)} lacks its label`);
  return found;
}

/** Draws every element as a whole box and every boundary as a whole frame. */
const boxesCheck = (c: Case, cs: C4Charset): unknown[] => {
  const { text, layout } = c.out[cs];
  const g = gridOf(text, layout, cs);
  const crowded = c4AsciiDrawing(layout, cs === 'ascii' ? ascii : unicode).labels.filter(
    (l) => l.crowded
  );
  // A frame cell under a `crowded` label (no clear place near its line) is the label's.
  const underCrowded = (x: number, y: number): boolean =>
    crowded.some((l) => x >= l.x && y >= l.y && x < l.x + l.width && y < l.y + l.height);
  const env: BoxEnv = { g, cs, underCrowded };
  const found = layout.elements.flatMap((e) =>
    borderProblems(env, g.rect(e.box), `element ${e.ast}`, undefined, false)
  );
  for (const b of layout.boundaries) {
    const label = linesOf(b.label).join(' ').trim();
    const r = g.rect(b.box);
    const shown = label === '' || cellWidth(label) > r.width - 4 ? undefined : label;
    found.push(...borderProblems(env, r, `boundary ${b.ast}`, shown, true));
  }
  return found;
};

/** Puts no two boxes on one cell, every element and frame inside its own frame. */
const apartCheck = (c: Case, cs: C4Charset): unknown[] => {
  const { text, layout, ...rest } = c.out[cs];
  void rest;
  const g = gridOf(text, layout, cs);
  const found: string[] = [];
  const els = layout.elements.map((e) => ({ ast: e.ast, r: g.rect(e.box) }));
  for (let i = 0; i < els.length; i++)
    for (let j = i + 1; j < els.length; j++)
      if (!apart(els[i]!.r, els[j]!.r)) found.push(`${els[i]!.ast} overlaps ${els[j]!.ast}`);
  const frames = new Map(layout.boundaries.map((b) => [b.index, { b, r: g.rect(b.box) }]));
  for (const { b, r } of frames.values()) {
    const parent = frames.get(b.parent);
    if (parent && !inside(r, parent.r)) found.push(`${b.ast} not inside ${parent.b.ast}`);
  }
  return found;
};

/** Writes every element’s text inside its box, and every relation label line. */
const textCheck = (c: Case, cs: C4Charset): unknown[] => {
  const { text, layout } = c.out[cs];
  const g = gridOf(text, layout, cs);
  const found: string[] = [];
  for (const e of layout.elements) {
    const r = g.rect(e.box);
    const rows = g.rows
      .slice(r.y + 1, r.y + r.height - 1)
      .map((row) => row.slice(r.x + 1, r.x + r.width - 1).join(''));
    for (const line of [e.name, e.type, e.descr].flatMap(linesOf))
      if (!rows.some((row) => row.includes(line.trim())))
        found.push(`${e.ast}: ${JSON.stringify(line)} not in its box`);
  }
  // A relation's label may be wrapped narrower to stay by its line: its words are there,
  // whole unless it was cut.
  const cut = new Set(
    c4AsciiDrawing(layout, cs === 'ascii' ? ascii : unicode)
      .labels.filter((l) =>
        /…|\.\.\./.test(
          g.rows
            .slice(l.y, l.y + l.height)
            .map((row) => row.slice(Math.max(0, l.x), l.x + l.width).join(''))
            .join(' ')
        )
      )
      .map((l) => l.ast)
  );
  for (const r of layout.relations.filter((rel) => !cut.has(rel.ast)))
    for (const word of [r.label, r.techn].flatMap(linesOf).join(' ').split(/\s+/))
      if (word !== '' && !text.includes(word))
        found.push(`${r.ast}: label word ${JSON.stringify(word)} missing`);
  return found;
};

/** Arrowheads round `r` pointing into it. */
function headsInto(g: Grid, heads: GlyphSet['head'], r: CellRect): number {
  let n = 0;
  for (let i = r.x + 1; i < r.x + r.width - 1; i++) {
    if (g.cell(i, r.y - 1) === heads.down) n++;
    if (g.cell(i, r.y + r.height) === heads.up) n++;
  }
  for (let j = r.y + 1; j < r.y + r.height - 1; j++) {
    if (g.cell(r.x - 1, j) === heads.right) n++;
    if (g.cell(r.x + r.width, j) === heads.left) n++;
  }
  return n;
}

/** Draws an arrowhead outside the side of every end with one. */
const headsCheck = (c: Case, cs: C4Charset): unknown[] => {
  const { text, layout } = c.out[cs];
  const g = gridOf(text, layout, cs);
  const boxes = new Map<string, CellRect>();
  for (const b of layout.boundaries) boxes.set(b.alias, g.rect(b.box));
  for (const e of layout.elements) boxes.set(e.alias, g.rect(e.box));
  const elementFirst = new Map<string, CellRect>();
  for (const e of [...layout.elements].reverse()) elementFirst.set(e.alias, g.rect(e.box));
  const boxOf = (alias: string) => elementFirst.get(alias) ?? boxes.get(alias)!;
  const want = new Map<CellRect, number>();
  for (const r of layout.relations) {
    if (r.endArrow) want.set(boxOf(r.to), (want.get(boxOf(r.to)) ?? 0) + 1);
    if (r.startArrow) want.set(boxOf(r.from), (want.get(boxOf(r.from)) ?? 0) + 1);
  }
  const heads = cs === 'ascii' ? ascii.head : unicode.head;
  // Two ends may share a cell; each end has one at the least when any does.
  return [...want]
    .filter(([r]) => headsInto(g, heads, r) === 0)
    .map(([r, n]) => `no arrowhead into the box at (${r.x}, ${r.y}), ${n} wanted`);
};

/** What a frame shows besides line glyphs, its own label and a crowded label's cells. */
function frameProblems(
  g: Grid,
  b: C4Layout['boundaries'][number],
  crowded: (x: number, y: number) => boolean
): string[] {
  const r = g.rect(b.box);
  const { corners, sides } = borderOf(r);
  const label = linesOf(b.label).join(' ').trim();
  const top = (g.rows[r.y] ?? []).slice(r.x, r.x + r.width).join('');
  const at = label === '' ? -1 : top.indexOf(` ${label.slice(0, 1)}`);
  // The label's own span in the top border: from its leading space to its trailing one.
  const inLabel = (x: number, y: number): boolean =>
    y === r.y && at >= 0 && x - r.x >= at && x - r.x <= at + cellWidth(label) + 1;
  const found: string[] = [];
  for (const [x, y] of [...corners, ...sides]) {
    const ch = g.cell(x, y);
    if (LINE.test(ch) || crowded(x, y) || inLabel(x, y)) continue;
    if (y === r.y && (ch === ' ' || ch === '…' || ch === '.')) continue;
    found.push(`${b.ast}: ${JSON.stringify(ch)} on its frame (${x}, ${y})`);
  }
  return found;
}

/** Keeps labels and arrowheads off frames: a frame shows line glyphs and its own label only. */
const framesCheck = (c: Case, cs: C4Charset): unknown[] => {
  const { text, layout } = c.out[cs];
  const g = gridOf(text, layout, cs);
  const drawing = c4AsciiDrawing(layout, cs === 'ascii' ? ascii : unicode);
  // A label with no clear place near its line (`crowded`) may cover a frame.
  const crowded = (x: number, y: number): boolean =>
    drawing.labels.some(
      (l) => l.crowded && x >= l.x && y >= l.y && x < l.x + l.width && y < l.y + l.height
    );
  return layout.boundaries.flatMap((b) => frameProblems(g, b, crowded));
};

const within = (r: CellRect, x: number, y: number): boolean =>
  x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;

/** Routes no relation through an element or under header text, and draws each where it says. */
const routesCheck = (c: Case, cs: C4Charset): unknown[] => {
  const { text, layout } = c.out[cs];
  const g = gridOf(text, layout, cs);
  const drawing = c4AsciiDrawing(layout, cs === 'ascii' ? ascii : unicode);
  const shapes = layout.elements.map((e) => g.rect(e.box));
  const heads = Object.values(cs === 'ascii' ? ascii.head : unicode.head);
  /** What is wrong with the line's cell (x, y). */
  const cellProblems = (ast: string, x: number, y: number): string[] => {
    const shown = g.cell(x, y);
    const notLine = !LINE.test(shown) && !heads.includes(shown);
    const labelled = drawing.labels.some((r) => within(r, x, y));
    return [
      ...(shapes.some((r) => within(r, x, y)) ? [`${ast}: (${x}, ${y}) inside an element`] : []),
      ...(drawing.headers.some((r) => within(r, x, y))
        ? [`${ast}: (${x}, ${y}) under header text`]
        : []),
      ...(!labelled && notLine
        ? [`${ast}: ${JSON.stringify(shown)} at (${x}, ${y}), not its line`]
        : []),
    ];
  };
  return drawing.lines.flatMap((line) =>
    line.cells.flatMap(({ x, y }) => cellProblems(line.ast, x, y))
  );
};

/** Puts every relation label at or within 2 cells of its own line, where it is written. */
const labelsCheck = (c: Case, cs: C4Charset): unknown[] => {
  const { text, layout } = c.out[cs];
  const g = gridOf(text, layout, cs);
  const drawing = c4AsciiDrawing(layout, cs === 'ascii' ? ascii : unicode);
  const found: string[] = [];
  for (const label of drawing.labels) {
    const cells = drawing.lines.find((l) => l.ast === label.ast)?.cells ?? [];
    const gap = Math.min(
      ...cells.map((p) =>
        Math.max(
          Math.max(label.x - p.x, p.x - (label.x + label.width - 1), 0),
          Math.max(label.y - p.y, p.y - (label.y + label.height - 1), 0)
        )
      )
    );
    if (gap > 2) found.push(`${label.ast}: label ${gap} cells from its line`);
    const rel = layout.relations.find((r) => r.ast === label.ast)!;
    const fold = (t: string): string => t.replace(/\s+/g, ' ').trim();
    const want = fold([...linesOf(rel.label), ...linesOf(rel.techn)].join(' '));
    const got = fold(
      g.rows
        .slice(label.y, label.y + label.height)
        .map((row) => row.slice(Math.max(0, label.x), label.x + label.width).join(''))
        .join(' ')
    );
    // Wrapped narrower, or a word cut where it is wider still.
    if (got !== want && !/…|\.\.\./.test(got))
      found.push(`${label.ast}: ${JSON.stringify(got)} at its place, not ${JSON.stringify(want)}`);
  }
  return found;
};

/** Has `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces. */
const sizeCheck = (c: Case, cs: C4Charset): unknown[] => {
  const { text, rows, columns } = c.out[cs];
  const lines = text === '' ? [] : text.split('\n');
  const widest = Math.max(0, ...lines.map(cellWidth));
  const found: string[] = [];
  if (lines.length !== rows) found.push(`${lines.length} lines, rows ${rows}`);
  if (widest !== columns) found.push(`widest ${widest}, columns ${columns}`);
  lines.forEach((l, i) => {
    if (/\s$/u.test(l)) found.push(`trailing space on line ${i + 1}`);
  });
  if (text.includes('\r')) found.push('\\r in text');
  return found;
};

/** Uses no Unicode line glyph or ellipsis in ASCII output. */
const plainCheck = (c: Case, cs: C4Charset): unknown[] => {
  if (cs !== 'ascii') return [];
  const { text, layout } = c.out[cs];
  const drawn = /[─-╿▲▼◄►…]/u;
  const labels = [
    layout.title,
    ...layout.boundaries.flatMap((b) => [b.label, b.type, b.descr]),
    ...layout.elements.flatMap((e) => [e.name, e.type, e.descr]),
    ...layout.relations.flatMap((r) => [r.label, r.techn]),
  ].flatMap(linesOf);
  if (labels.some((t) => drawn.test(t))) return [];
  return drawn.test(text) ? ['Unicode glyph in ASCII output'] : [];
};

const CHECKS: readonly (readonly [string, (c: Case, cs: C4Charset) => unknown[]])[] = [
  ['is deterministic, and draws what the hook draws', sameCheck],
  ['draws every element as a whole box and every boundary as a whole frame', boxesCheck],
  ['puts no two boxes on one cell, every element and frame inside its own frame', apartCheck],
  ['writes every element’s text inside its box, and every relation label line', textCheck],
  ['draws an arrowhead outside the side of every end with one', headsCheck],
  [
    'keeps labels and arrowheads off frames: a frame shows line glyphs and its own label only',
    framesCheck,
  ],
  [
    'routes no relation through an element or under header text, and draws each where it says',
    routesCheck,
  ],
  [
    'puts every relation label at or within 2 cells of its own line, where it is written',
    labelsCheck,
  ],
  [
    'has `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces',
    sizeCheck,
  ],
  ['uses no Unicode line glyph or ellipsis in ASCII output', plainCheck],
];

/** Registers the suite: `sources` drawn in both charsets, each property checked on every one. */
export function describeC4AsciiProperties(title: string, sources: Sources, least: number): void {
  describe(title, () => {
    beforeAll(() => load(sources), 600_000);

    it('renders every diagram that renders to SVG', () => {
      expect(cases.length).toBeGreaterThan(least);
      expect(failed).toEqual({});
    });

    for (const [name, check] of CHECKS)
      it(name, () => expect(perCharset(check)).toEqual({}), CHECK_TIMEOUT);
  });
}
