import { beforeAll, describe, expect, it } from 'vitest';
import { cellWidth, graphemes } from '@mermaid-js/core/ascii';
import type { KanbanLayout, PlacedLabel, Rect } from '@mermaid-js/diagram-kanban';
import { createMermaid, MermaidError } from 'mermaid';
import { kanbanCases, kanbanCorpus } from '../kanban/corpus.ts';
import { renderKanbanAscii, type KanbanAsciiResult } from './kanban-render.ts';
import type { Charset } from './structure.ts';

// ASCII render properties of the kanban board (#466, D320, R-ASCII-9) over the kanban corpus
// (e2e fixtures, v12 spec and syntax-page strings, the cases file), in both charsets: renders
// wherever SVG renders, deterministic, every column and card a whole box where its layout puts
// it (corners and sides; a column's title on its top border), no two boxes on one cell, every
// label line on its row, a priority edge on every card with a bar, `rows` lines none wider
// than `columns` and one exactly that wide, no trailing spaces, and no Unicode glyph in ASCII
// output.

const CHARSETS: Charset[] = ['unicode', 'ascii'];

interface Case {
  id: string;
  out: Record<Charset, KanbanAsciiResult>;
  again: Record<Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};

beforeAll(async () => {
  const svg = createMermaid();
  svg.initialize({ deterministic: true });
  for (const item of [...(await kanbanCorpus()), ...kanbanCases()]) {
    try {
      await svg.render('k', item.source);
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
      continue; // SVG does not render it either
    }
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        out[charset] = await renderKanbanAscii(item.source, { charset });
        again[charset] = (await renderKanbanAscii(item.source, { charset })).text;
      }
      cases.push({ id: item.id, out, again });
    } catch (e) {
      failed[item.id] = String(e);
    }
  }
}, 300_000);

const perCharset = (check: (c: Case, charset: Charset) => unknown[]) => {
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

interface Grid {
  rows: string[][];
  /** Layout units to text cells: the text starts at the drawing's top-left content. */
  x(v: number): number;
  y(v: number): number;
}

/** The text as cells, with the layout's origin: its leftmost and topmost drawn cell. */
function gridOf(text: string, layout: KanbanLayout): Grid {
  const labels: PlacedLabel[] = [];
  for (const c of layout.columns) if (c.title) labels.push(c.title);
  for (const c of layout.cards)
    for (const l of [c.title, c.ticket, c.assignee]) if (l) labels.push(l);
  const at = (v: number, o: number): number => Math.floor(v - o + 1e-9);
  const { bounds } = layout;
  // Column titles are centred on their column; the others start at their own x.
  const lefts = [
    ...layout.columns.map((c) => at(c.x, bounds.x)),
    ...layout.cards.flatMap((c) =>
      [c.title, c.ticket, c.assignee].flatMap((l) => (l ? [at(l.x, bounds.x)] : []))
    ),
  ];
  const tops = [
    ...layout.columns.map((c) => at(c.y, bounds.y)),
    ...labels.map((l) => at(l.y, bounds.y)),
  ];
  const ox = Math.min(...lefts);
  const oy = Math.min(...tops);
  return {
    rows: text.split('\n').map(cellsOf),
    x: (v) => at(v, bounds.x) - ox,
    y: (v) => at(v, bounds.y) - oy,
  };
}

const CORNERS = { unicode: '┌┐└┘┎┖', ascii: '+' };
const SIDES = { unicode: '│┃┆', ascii: '|I:' };
const RULES = { unicode: '─', ascii: '-' };

/** What is wrong with the box `r` as drawn: its corners and sides; a title may cut its top. */
function boxFaults(g: Grid, r: Rect, charset: Charset, name: string): string[] {
  const x = g.x(r.x);
  const y = g.y(r.y);
  const right = g.x(r.x + r.width) - 1;
  const bottom = g.y(r.y + r.height) - 1;
  const cell = (cx: number, cy: number): string => g.rows[cy]?.[cx] ?? ' ';
  const out: string[] = [];
  for (const [cx, cy] of [
    [x, y],
    [right, y],
    [x, bottom],
    [right, bottom],
  ] as const)
    if (!CORNERS[charset].includes(cell(cx, cy)))
      out.push(
        `${name}: ${JSON.stringify(cell(cx, cy))} at a corner (row ${cy + 1}, column ${cx + 1})`
      );
  for (let j = y + 1; j < bottom; j++)
    for (const cx of [x, right])
      if (!SIDES[charset].includes(cell(cx, j)))
        out.push(
          `${name}: ${JSON.stringify(cell(cx, j))} on a side (row ${j + 1}, column ${cx + 1})`
        );
  for (let i = x + 1; i < right; i++)
    if (cell(i, bottom) !== RULES[charset])
      out.push(
        `${name}: ${JSON.stringify(cell(i, bottom))} on the bottom (row ${bottom + 1}, column ${i + 1})`
      );
  return out;
}

describe('kanban ascii corpus properties (#466, R-ASCII-9)', () => {
  it('renders every kanban board that renders to SVG', () => {
    expect(cases.length).toBeGreaterThan(100);
    expect(failed).toEqual({});
  });

  it('is deterministic', () => {
    expect(perCharset((c, cs) => (c.out[cs].text === c.again[cs] ? [] : ['differs']))).toEqual({});
  });

  it('draws every column and card as a whole box where the layout puts it', () => {
    expect(
      perCharset((c, cs) => {
        const { text, layout } = c.out[cs];
        if (layout.columns.length === 0) return text === '' ? [] : ['an empty board drew text'];
        const g = gridOf(text, layout);
        return [
          ...layout.columns.flatMap((col) => boxFaults(g, col, cs, `column ${col.ast}`)),
          ...layout.cards.flatMap((card) => boxFaults(g, card, cs, `card ${card.ast}`)),
        ];
      })
    ).toEqual({});
  });

  it('puts no two boxes on one cell', () => {
    expect(
      perCharset((c, cs) => {
        const { text, layout } = c.out[cs];
        if (layout.columns.length === 0) return [];
        const g = gridOf(text, layout);
        const owner = new Map<string, string>();
        const found: string[] = [];
        const claim = (r: Rect, name: string, inside: string | undefined): void => {
          for (let j = g.y(r.y); j < g.y(r.y + r.height); j++)
            for (let i = g.x(r.x); i < g.x(r.x + r.width); i++) {
              const key = `${i},${j}`;
              const was = owner.get(key);
              if (was !== undefined && was !== inside) found.push(`${name} overlaps ${was}`);
              owner.set(key, name);
            }
        };
        for (const col of layout.columns) claim(col, `column ${col.ast}`, undefined);
        for (const card of layout.cards)
          claim(card, `card ${card.ast}`, `column ${layout.columns[card.column]!.ast}`);
        return [...new Set(found)];
      })
    ).toEqual({});
  });

  it('writes every label line on its row', () => {
    expect(
      perCharset((c, cs) => {
        const { text, layout } = c.out[cs];
        if (layout.columns.length === 0) return [];
        const g = gridOf(text, layout);
        const labels: [string, PlacedLabel][] = [];
        for (const col of layout.columns) if (col.title) labels.push([col.ast, col.title]);
        for (const card of layout.cards)
          for (const l of [card.title, card.ticket, card.assignee])
            if (l) labels.push([card.ast, l]);
        const found: string[] = [];
        for (const [ast, label] of labels)
          label.text.lines.forEach((runs, i) => {
            let line = runs.map((r) => r.text).join('');
            if (cs === 'ascii' && label.text.left) line = line.replace(/^(\s*)[•◦]/, '$1-');
            const row = (g.rows[g.y(label.y) + i] ?? []).join('');
            if (!row.includes(line))
              found.push(`${ast}: ${JSON.stringify(line)} not on row ${g.y(label.y) + i + 1}`);
          });
        return found;
      })
    ).toEqual({});
  });

  it('draws a priority edge on every card with a bar, and only there', () => {
    const edges = {
      unicode: { heavy: '┃', dashed: '┆', plain: '│' },
      ascii: { heavy: 'I', dashed: ':', plain: '|' },
    };
    const tags = { 'Very High': ' !! ', High: ' ! ', Low: ' - ', 'Very Low': ' -- ' };
    expect(
      perCharset((c, cs) => {
        const { text, layout } = c.out[cs];
        if (layout.columns.length === 0) return [];
        const g = gridOf(text, layout);
        const found: string[] = [];
        for (const card of layout.cards) {
          const x = g.x(card.x);
          const y = g.y(card.y);
          const p = card.bar?.priority;
          const want =
            p === undefined
              ? edges[cs].plain
              : p === 'Very High' || p === 'High'
                ? edges[cs].heavy
                : edges[cs].dashed;
          const got = g.rows[y + 1]?.[x];
          if (got !== want)
            found.push(`card ${card.ast}: left edge ${JSON.stringify(got)}, not ${want}`);
          const top = (g.rows[y] ?? []).slice(x, g.x(card.x + card.width)).join('');
          if (
            cs === 'ascii' &&
            p !== undefined &&
            card.width >= 10 &&
            !top.startsWith(`+-${tags[p]}`)
          )
            found.push(`card ${card.ast}: top border ${JSON.stringify(top)} has no ${p} tag`);
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

  it('uses no Unicode line glyph in ASCII output', () => {
    const unicodeGlyphs = /[─-╿]/u;
    expect(
      perCharset((c, cs) => {
        if (cs !== 'ascii') return [];
        const { text, layout } = c.out[cs];
        const labels = [
          ...layout.columns.map((col) => col.title),
          ...layout.cards.flatMap((card) => [card.title, card.ticket, card.assignee]),
        ].flatMap((l) => (l ? l.text.lines.map((runs) => runs.map((r) => r.text).join('')) : []));
        if (labels.some((t) => unicodeGlyphs.test(t))) return [];
        return unicodeGlyphs.test(text) ? ['Unicode glyph in ASCII output'] : [];
      })
    ).toEqual({});
  });
});
