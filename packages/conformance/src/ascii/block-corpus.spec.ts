import { beforeAll, describe, expect, it } from 'vitest';
import { cellWidth, graphemes } from '@mermaid-js/core/ascii';
import { parseBlock, type BlockModel } from '@mermaid-js/diagram-block';
import { drawBlockText, type Route, type TextBox } from '@mermaid-js/diagram-block/testing';
import { createMermaid, MermaidError, type TextRenderResult } from 'mermaid';
import { blockCases, blockCorpus } from '../block/corpus.ts';
import { nestedComposites } from './block-fuzz.ts';
import { sizeFaults } from './flow-checks.ts';
import type { Charset } from './structure.ts';

// ASCII render properties of the block diagram (#559, D449, D320, R-ASCII-9) over the block
// corpus (e2e fixtures, v12 spec and syntax-page strings, the cases file) and seeded nested
// composites with edges and labels (pitfall 20), in both charsets: renders wherever SVG renders,
// deterministic, the public API's text is the `./ascii` entry's, every box and frame whole where
// the text grid puts it, no box crossing another or its frame, every label line in its box,
// nothing but lines on a frame's border (no arrowhead, no label), every edge's arrowheads next to
// its boxes and its label drawn, `rows` and `columns` right, no trailing spaces, and no Unicode
// glyph in ASCII output.

const CHARSETS: Charset[] = ['unicode', 'ascii'];

type Direct = ReturnType<typeof drawBlockText>;

interface Case {
  id: string;
  model: BlockModel;
  out: Record<Charset, TextRenderResult>;
  direct: Record<Charset, Direct>;
  again: Record<Charset, string>;
}

const cases: Case[] = [];
const fuzzed: Case[] = [];
const failed: Record<string, string> = {};

const mermaid = createMermaid();
mermaid.initialize({ deterministic: true });

async function caseOf(id: string, source: string): Promise<Case> {
  const model = parseBlock(source).model;
  const out = {} as Case['out'];
  const direct = {} as Case['direct'];
  const again = {} as Case['again'];
  for (const charset of CHARSETS) {
    const call = { format: 'ascii', config: { ascii: { charset } } } as const;
    out[charset] = await mermaid.render('b', source, call);
    again[charset] = (await mermaid.render('b', source, call)).text;
    direct[charset] = drawBlockText(model, {
      config: { ascii: { charset } } as never,
      warn: () => {},
    });
  }
  return { id, model, out, direct, again };
}

beforeAll(async () => {
  for (const item of [...(await blockCorpus()), ...blockCases()]) {
    try {
      await mermaid.render('s', item.source);
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
      continue; // SVG does not render it either
    }
    try {
      cases.push(await caseOf(item.id, item.source));
    } catch (e) {
      failed[item.id] = String(e);
    }
  }
  for (const [i, source] of nestedComposites(300).entries()) {
    try {
      fuzzed.push(await caseOf(`fuzz-${i}`, source));
    } catch (e) {
      failed[`fuzz-${i}`] = `${String(e)}\n${source}`;
    }
  }
}, 600_000);

const perCharset = (from: Case[], check: (c: Case, charset: Charset) => unknown[]) => {
  const out: Record<string, unknown[]> = {};
  for (const c of from) {
    const found = CHARSETS.flatMap((cs) => check(c, cs).map((p) => `${cs}: ${String(p)}`));
    if (found.length > 0) out[c.id] = found.slice(0, 8);
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

/** The drawing's cells, addressed in grid cells. */
function gridOf(d: Direct) {
  const rows = d.text.split('\n').map(cellsOf);
  return (x: number, y: number): string => rows[y + d.origin.y]?.[x + d.origin.x] ?? ' ';
}

const LINE = { unicode: /^[─-╿]$/u, ascii: /^[-|+=I:.]$/ };
const CORNERS = { unicode: '┌┐└┘╭╮╰╯╓╖╙╜╒╕╘╛', ascii: '+' };
// By `Dir`: up, right, down, left.
const HEADS = { unicode: '▲►▼◄', ascii: '^>v<' };
const MARKS = { unicode: '◇<>▲▼◄►', ascii: '*<>^v' };

/** Every border cell of `r`, corners flagged. */
function border(r: TextBox['rect']): { x: number; y: number; corner: boolean }[] {
  const out: { x: number; y: number; corner: boolean }[] = [];
  const right = r.x + r.width - 1;
  const bottom = r.y + r.height - 1;
  for (let x = r.x; x <= right; x++)
    for (const y of [r.y, bottom]) out.push({ x, y, corner: x === r.x || x === right });
  for (let y = r.y + 1; y < bottom; y++)
    for (const x of [r.x, right]) out.push({ x, y, corner: false });
  return out;
}

/** The title's cells on a frame's top border, with the blank either side. */
function titleCells(b: TextBox): Set<number> {
  const out = new Set<number>();
  const t = b.lines[0];
  if (!t) return out;
  const w = cellWidth(t);
  const x = b.rect.x + Math.floor((b.rect.width - w) / 2);
  for (let i = x - 1; i <= x + w; i++) out.add(i);
  return out;
}

function boxFaults(d: Direct, cs: Charset): string[] {
  const at = gridOf(d);
  const out: string[] = [];
  for (const b of d.grid.boxes) {
    const title = b.frame ? titleCells(b) : new Set<number>();
    for (const { x, y, corner } of border(b.rect)) {
      const g = at(x, y);
      if (corner) {
        if (!CORNERS[cs].includes(g)) out.push(`${b.ast}: ${JSON.stringify(g)} at a corner`);
        continue;
      }
      if (b.frame && y === b.rect.y && title.has(x)) continue;
      // A frame's border holds lines only (pitfall 20); a box's its marks too.
      if (LINE[cs].test(g) || (!b.frame && MARKS[cs].includes(g))) continue;
      out.push(`${b.ast}: ${JSON.stringify(g)} on the border at ${x},${y}`);
    }
    if (b.frame) continue;
    // A leaf's inside: its label and blanks, no line through it.
    const text: string[] = [];
    for (let y = b.rect.y + 1; y < b.rect.y + b.rect.height - 1; y++) {
      let row = '';
      for (let x = b.rect.x + 1; x < b.rect.x + b.rect.width - 1; x++) row += at(x, y);
      text.push(row);
      if (cs === 'unicode' && /[─-╿]/u.test(row) && !b.lines.some((l) => /[─-╿]/u.test(l)))
        out.push(`${b.ast}: a line inside the box on row ${y}`);
    }
    for (const line of b.lines)
      if (!text.some((r) => r.includes(line)))
        out.push(`${b.ast}: label line ${JSON.stringify(line)} not in its box`);
  }
  return out;
}

function nestingFaults(d: Direct): string[] {
  const out: string[] = [];
  const { boxes } = d.grid;
  const within = (a: TextBox['rect'], b: TextBox['rect']): boolean =>
    a.x > b.x && a.y > b.y && a.x + a.width < b.x + b.width && a.y + a.height < b.y + b.height;
  const apart = (a: TextBox['rect'], b: TextBox['rect']): boolean =>
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
  boxes.forEach((b, i) => {
    if (b.parent !== undefined && !within(b.rect, boxes[b.parent]!.rect))
      out.push(`${b.ast} is not inside its frame ${boxes[b.parent]!.ast}`);
    for (let j = i + 1; j < boxes.length; j++) {
      const o = boxes[j]!;
      if (o.parent === i || b.parent === j) continue;
      let p = o.parent;
      while (p !== undefined && p !== i) p = boxes[p]!.parent;
      if (p === i) continue;
      if (!apart(b.rect, o.rect)) out.push(`${b.ast} overlaps ${o.ast}`);
    }
  });
  return out;
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

function edgeFaults(c: Case, cs: Charset): string[] {
  const d = c.direct[cs];
  const at = gridOf(d);
  const out: string[] = [];
  const frames = d.grid.boxes.filter((b) => b.frame);
  const onFrame = (x: number, y: number): boolean =>
    frames.some((f) => border(f.rect).some((p) => p.x === x && p.y === y));
  for (const e of c.model.edges) {
    const r: Route | undefined = d.routes.get(e.ast);
    if (!r) continue;
    const ends = [
      [r.cells[0]!, r.startInto, e.arrowTypeStart],
      [r.cells[r.cells.length - 1]!, r.endInto, e.arrowTypeEnd],
    ] as const;
    for (const [p, into, type] of ends) {
      if (onFrame(p.x, p.y)) out.push(`${e.ast}: an end on a frame at ${p.x},${p.y}`);
      if (type !== 'arrow_point' || r.cells.length < 2) continue;
      const head = HEADS[cs][into];
      if (at(p.x, p.y) !== head)
        out.push(`${e.ast}: ${JSON.stringify(at(p.x, p.y))} where its arrowhead ${head} goes`);
      // The head points at the box next to it.
      if (at(p.x + DX[into]!, p.y + DY[into]!) === ' ')
        out.push(`${e.ast}: its head points at nothing`);
    }
  }
  return out;
}

function labelFaults(c: Case, cs: Charset): string[] {
  const { text } = c.direct[cs];
  const mark = cs === 'unicode' ? '…' : '~';
  const out: string[] = [];
  for (const e of c.model.edges) {
    if (e.label === '' || !c.direct[cs].routes.has(e.ast)) continue;
    // The label as the grid cuts it: its first word is enough to find it.
    const word =
      e.label
        .replace(/<br\s*\/?>/gi, ' ')
        .trim()
        .split(/\s+/)[0] ?? '';
    const probe = word.length > 6 ? word.slice(0, 6) : word;
    if (probe !== '' && !/[&<>]/.test(probe) && !text.includes(probe) && !text.includes(mark))
      out.push(`${e.ast}: label ${JSON.stringify(e.label)} not drawn`);
  }
  return out;
}

const suites: [string, () => Case[]][] = [
  ['corpus', () => cases],
  ['nested composites', () => fuzzed],
];

describe('block ascii corpus properties (#559, D449, R-ASCII-9)', () => {
  it('renders every block diagram that renders to SVG, and the fuzzed ones', () => {
    expect(cases.length).toBeGreaterThan(100);
    expect(fuzzed.length).toBe(300);
    expect(failed).toEqual({});
  });

  for (const [name, of] of suites) {
    describe(name, () => {
      it('is deterministic, and the API draws what the ./ascii entry draws', () => {
        expect(
          perCharset(of(), (c, cs) => [
            ...(c.out[cs].text === c.again[cs] ? [] : ['differs between renders']),
            ...(c.out[cs].text === c.direct[cs].text ? [] : ['the API text is not the entry’s']),
          ])
        ).toEqual({});
      });

      it('draws every box and frame whole where the grid puts it, its label inside', () => {
        expect(perCharset(of(), (c, cs) => boxFaults(c.direct[cs], cs))).toEqual({});
      });

      it('keeps every box inside its frame and apart from the others', () => {
        expect(perCharset(of(), (c, cs) => nestingFaults(c.direct[cs]))).toEqual({});
      });

      it('ends every edge next to its boxes, off frames, with its arrowheads (pitfall 20)', () => {
        expect(perCharset(of(), (c, cs) => edgeFaults(c, cs))).toEqual({});
      });

      it('draws every edge label', () => {
        expect(perCharset(of(), (c, cs) => labelFaults(c, cs))).toEqual({});
      });

      it('finds a route for every edge (no ASCII_ROUTE)', () => {
        expect(
          perCharset(of(), (c, cs) => c.out[cs].warnings.filter((w) => w.code === 'ASCII_ROUTE'))
        ).toEqual({});
      });

      it('has `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces', () => {
        expect(perCharset(of(), (c, cs) => sizeFaults(c.out[cs], cellWidth))).toEqual({});
      });

      it('uses no Unicode line glyph or arrowhead in ASCII output', () => {
        const glyphs = /[─-╿▲▼◄►◇●✕…]/u;
        expect(
          perCharset(of(), (c, cs) => {
            if (cs !== 'ascii') return [];
            const labels = c.direct.ascii.grid.boxes.flatMap((b) => b.lines);
            for (const e of c.model.edges) labels.push(e.label);
            if (labels.some((t) => glyphs.test(t))) return [];
            return glyphs.test(c.out[cs].text) ? ['Unicode glyph in ASCII output'] : [];
          })
        ).toEqual({});
      });
    });
  }
});
