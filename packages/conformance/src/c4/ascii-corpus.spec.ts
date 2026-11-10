import { beforeAll, describe, expect, it } from 'vitest';
import { ascii, cellWidth, graphemes, unicode, type CellRect } from '@mermaid-js/core/ascii';
import type { C4Layout, PlacedLabel, Rect } from '@mermaid-js/diagram-c4';
import { c4AsciiDrawing, c4CellRect } from '@mermaid-js/diagram-c4/testing';
import { createMermaid, MermaidError } from 'mermaid';
import { renderC4Ascii, type C4AsciiResult, type C4Charset } from './ascii-render.ts';
import { c4Cases, c4Corpus } from './corpus.ts';

// ASCII render properties of C4 (#545, D459, R-ASCII-9) over the C4 corpus (e2e fixtures, v12
// spec and syntax-page strings, the cases file), in both charsets, through the public API:
// renders wherever SVG renders, deterministic, the drawing the hook's (`c4AsciiDrawing`, whose
// trimmed margin places the layout on the text), every element a whole box where the layout
// puts it and every boundary a whole frame, no two boxes on one cell and every element inside
// its frame, every label line present (an element's inside its box, a boundary's label in its
// top border, a relation's somewhere), an arrowhead outside the side of every end that has one,
// nothing but line glyphs and its own label on a frame (pitfall 20), no relation through an
// element or under header text, every label at or within 2 cells of its own line, `rows` lines
// none wider than `columns` and one exactly that wide, no trailing spaces, no Unicode glyph in
// ASCII.

const CHARSETS: C4Charset[] = ['unicode', 'ascii'];

interface Case {
  id: string;
  out: Record<C4Charset, C4AsciiResult>;
  again: Record<C4Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};

beforeAll(async () => {
  const svg = createMermaid();
  svg.initialize({ deterministic: true });
  for (const item of [...(await c4Corpus()), ...c4Cases()]) {
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
}, 600_000);

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

describe('c4 ascii corpus properties (#545, D459, R-ASCII-9)', () => {
  it('renders every C4 diagram that renders to SVG', () => {
    expect(cases.length).toBeGreaterThan(100);
    expect(failed).toEqual({});
  });

  it('is deterministic, and draws what the hook draws', () => {
    expect(
      perCharset((c, cs) => {
        const { text, layout } = c.out[cs];
        const found: string[] = [];
        if (text !== c.again[cs]) found.push('differs');
        if (c4AsciiDrawing(layout, cs === 'ascii' ? ascii : unicode).text !== text)
          found.push('not the hook’s drawing');
        return found;
      })
    ).toEqual({});
  });

  it('draws every element as a whole box and every boundary as a whole frame', () => {
    expect(
      perCharset((c, cs) => {
        const { text, layout } = c.out[cs];
        const g = gridOf(text, layout, cs);
        const found: string[] = [];
        const crowded = c4AsciiDrawing(layout, cs === 'ascii' ? ascii : unicode).labels.filter(
          (l) => l.crowded
        );
        // A frame cell under a `crowded` label (no clear place near its line) is the label's.
        const underCrowded = (x: number, y: number): boolean =>
          crowded.some((l) => x >= l.x && y >= l.y && x < l.x + l.width && y < l.y + l.height);
        const check = (r: CellRect, name: string, label?: string, frame = false): void => {
          const { corners, sides } = borderOf(r);
          for (const [x, y] of corners)
            if (!(frame && underCrowded(x, y)) && !BORDER[cs].corner.includes(g.cell(x, y)))
              found.push(`${name}: ${JSON.stringify(g.cell(x, y))} at a corner (${x}, ${y})`);
          const top = g.rows[r.y]?.slice(r.x, r.x + r.width).join('') ?? '';
          for (const [x, y] of sides) {
            // A frame's own label (a space either side) sits in its top border.
            if ((label && y === r.y) || (frame && underCrowded(x, y))) continue;
            if (!BORDER[cs].side.includes(g.cell(x, y)))
              found.push(`${name}: ${JSON.stringify(g.cell(x, y))} on a side (${x}, ${y})`);
          }
          if (label && !top.includes(` ${label} `))
            found.push(`${name}: top border ${JSON.stringify(top)} lacks its label`);
        };
        for (const e of layout.elements) check(g.rect(e.box), `element ${e.ast}`);
        for (const b of layout.boundaries) {
          const label = linesOf(b.label).join(' ').trim();
          const r = g.rect(b.box);
          check(
            r,
            `boundary ${b.ast}`,
            label === '' || cellWidth(label) > r.width - 4 ? undefined : label,
            true
          );
        }
        return found;
      })
    ).toEqual({});
  });

  it('puts no two boxes on one cell, every element and frame inside its own frame', () => {
    expect(
      perCharset((c, cs) => {
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
      })
    ).toEqual({});
  });

  it('writes every element’s text inside its box, and every relation label line', () => {
    expect(
      perCharset((c, cs) => {
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
      })
    ).toEqual({});
  });

  it('draws an arrowhead outside the side of every end with one', () => {
    expect(
      perCharset((c, cs) => {
        const { text, layout } = c.out[cs];
        const g = gridOf(text, layout, cs);
        const heads = cs === 'ascii' ? ascii.head : unicode.head;
        const boxes = new Map<string, CellRect>();
        for (const b of layout.boundaries) boxes.set(b.alias, g.rect(b.box));
        for (const e of layout.elements) boxes.set(e.alias, g.rect(e.box));
        const elementFirst = new Map<string, CellRect>();
        for (const e of [...layout.elements].reverse()) elementFirst.set(e.alias, g.rect(e.box));
        const boxOf = (alias: string) => elementFirst.get(alias) ?? boxes.get(alias)!;
        /** Arrowheads round `r` pointing into it. */
        const headsInto = (r: CellRect): number => {
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
        };
        const want = new Map<CellRect, number>();
        for (const r of layout.relations) {
          if (r.endArrow) want.set(boxOf(r.to), (want.get(boxOf(r.to)) ?? 0) + 1);
          if (r.startArrow) want.set(boxOf(r.from), (want.get(boxOf(r.from)) ?? 0) + 1);
        }
        const found: string[] = [];
        for (const [r, n] of want) {
          const got = headsInto(r);
          // Two ends may share a cell; each end has one at the least when any does.
          if (got === 0) found.push(`no arrowhead into the box at (${r.x}, ${r.y}), ${n} wanted`);
        }
        return found;
      })
    ).toEqual({});
  });

  it('keeps labels and arrowheads off frames: a frame shows line glyphs and its own label only', () => {
    expect(
      perCharset((c, cs) => {
        const { text, layout } = c.out[cs];
        const g = gridOf(text, layout, cs);
        const found: string[] = [];
        for (const b of layout.boundaries) {
          const r = g.rect(b.box);
          const { corners, sides } = borderOf(r);
          const label = linesOf(b.label).join(' ').trim();
          const top = (g.rows[r.y] ?? []).slice(r.x, r.x + r.width).join('');
          const at = label === '' ? -1 : top.indexOf(` ${label.slice(0, 1)}`);
          const drawing = c4AsciiDrawing(layout, cs === 'ascii' ? ascii : unicode);
          // A label with no clear place near its line (`crowded`) may cover a frame.
          const crowded = (x: number, y: number): boolean =>
            drawing.labels.some(
              (l) => l.crowded && x >= l.x && y >= l.y && x < l.x + l.width && y < l.y + l.height
            );
          for (const [x, y] of [...corners, ...sides]) {
            const ch = g.cell(x, y);
            if (LINE.test(ch) || crowded(x, y)) continue;
            // The label's own span in the top border: from its leading space to its trailing one.
            if (y === r.y && at >= 0 && x - r.x >= at && x - r.x <= at + cellWidth(label) + 1)
              continue;
            if (y === r.y && (ch === ' ' || ch === '…' || ch === '.')) continue;
            found.push(`${b.ast}: ${JSON.stringify(ch)} on its frame (${x}, ${y})`);
          }
        }
        return found;
      })
    ).toEqual({});
  });

  it('routes no relation through an element or under header text, and draws each where it says', () => {
    expect(
      perCharset((c, cs) => {
        const { text, layout } = c.out[cs];
        const g = gridOf(text, layout, cs);
        const drawing = c4AsciiDrawing(layout, cs === 'ascii' ? ascii : unicode);
        const shapes = layout.elements.map((e) => g.rect(e.box));
        const within = (r: CellRect, x: number, y: number): boolean =>
          x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
        const heads = Object.values(cs === 'ascii' ? ascii.head : unicode.head);
        const found: string[] = [];
        for (const line of drawing.lines)
          for (const { x, y } of line.cells) {
            if (shapes.some((r) => within(r, x, y)))
              found.push(`${line.ast}: (${x}, ${y}) inside an element`);
            if (drawing.headers.some((r) => within(r, x, y)))
              found.push(`${line.ast}: (${x}, ${y}) under header text`);
            const shown = g.cell(x, y);
            const labelled = drawing.labels.some((r) => within(r, x, y));
            if (!labelled && !LINE.test(shown) && !heads.includes(shown))
              found.push(`${line.ast}: ${JSON.stringify(shown)} at (${x}, ${y}), not its line`);
          }
        return found;
      })
    ).toEqual({});
  });

  it('puts every relation label at or within 2 cells of its own line, where it is written', () => {
    expect(
      perCharset((c, cs) => {
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
            found.push(
              `${label.ast}: ${JSON.stringify(got)} at its place, not ${JSON.stringify(want)}`
            );
        }
        return found;
      })
    ).toEqual({});
  });

  it('has `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces', () => {
    expect(
      perCharset((c, cs) => {
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
      })
    ).toEqual({});
  });

  it('uses no Unicode line glyph or ellipsis in ASCII output', () => {
    const drawn = /[─-╿▲▼◄►…]/u;
    expect(
      perCharset((c, cs) => {
        if (cs !== 'ascii') return [];
        const { text, layout } = c.out[cs];
        const labels = [
          layout.title,
          ...layout.boundaries.flatMap((b) => [b.label, b.type, b.descr]),
          ...layout.elements.flatMap((e) => [e.name, e.type, e.descr]),
          ...layout.relations.flatMap((r) => [r.label, r.techn]),
        ].flatMap(linesOf);
        if (labels.some((t) => drawn.test(t))) return [];
        return drawn.test(text) ? ['Unicode glyph in ASCII output'] : [];
      })
    ).toEqual({});
  });
});
