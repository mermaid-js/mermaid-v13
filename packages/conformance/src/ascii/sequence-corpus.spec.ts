import { beforeAll, describe, expect, it } from 'vitest';
import { cellWidth, graphemes } from '@mermaid-js/core/ascii';
import {
  detectSequence,
  type ArrowKind,
  type SequenceModel,
  type SequenceStatement,
} from '@mermaid-js/diagram-sequence';
import { MermaidError } from 'mermaid';
import { sequenceCorpus } from '../sequence/corpus.ts';
import { sequenceApi } from '../sequence/render-api.ts';
import { renderSequenceAscii, type SequenceAsciiResult } from './sequence-render.ts';
import { readSequence, sequenceExpectedOf } from './sequence-structure.ts';
import type { Charset } from './structure.ts';

// ASCII render properties of the sequence diagram (#150, D100, R-ASCII-9) over the sequence
// corpus (e2e fixtures and v12 spec strings), in both charsets: renders wherever SVG renders,
// deterministic, every participant label inside a box and every message, note, fragment and
// box label present, as many arrowheads as the messages have heads in v12, `rows` lines none
// wider than `columns` and one exactly that wide, no trailing spaces, and no Unicode line
// glyph in ASCII output.

const CHARSETS: Charset[] = ['unicode', 'ascii'];

/** The top-left corner of what a layout draws: where the trimmed text starts. */
function originOf(l: SequenceAsciiResult['layout']): { x: number; y: number } {
  const rects = [
    ...l.participants,
    ...l.boxes,
    ...l.notes,
    ...l.fragments,
    ...l.messages.flatMap((m) => (m.label ? [m.label] : [])),
    ...(l.title ? [l.title] : []),
  ];
  return {
    x: Math.min(...rects.map((r) => r.x), ...l.messages.map((m) => Math.min(m.startX, m.stopX))),
    y: Math.min(...rects.map((r) => ('top' in r ? r.top : r.y))),
  };
}

/** A line as cells: wide graphemes take two, zero-width ones join the cell before. */
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

interface Case {
  id: string;
  model: SequenceModel;
  out: Record<Charset, SequenceAsciiResult>;
  again: Record<Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};

beforeAll(async () => {
  const svg = sequenceApi();
  for (const item of await sequenceCorpus()) {
    const source = item.source;
    if (!detectSequence(source)) continue;
    let model: SequenceModel;
    try {
      model = (await svg.prepare(source)).parse.model as SequenceModel;
      svg.renderSync(source);
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
      continue; // SVG does not render it either
    }
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        out[charset] = await renderSequenceAscii(item.source, { charset });
        again[charset] = (await renderSequenceAscii(item.source, { charset })).text;
      }
      cases.push({ id: item.id, model, out, again });
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

// v12's markers (`svgDraw.js`): `->` and `-->` have none; the reverse half arrows only a start
// one; bidirectional arrows one at each end; every other arrow one at its end.
const headsOf = (arrow: ArrowKind): number => {
  if (arrow === 'solid_open' || arrow === 'dotted_open') return 0;
  if (arrow.startsWith('bidirectional')) return 2;
  return 1;
};

function drawnMessages(statements: readonly SequenceStatement[], shown: ReadonlySet<string>) {
  const out: ArrowKind[] = [];
  for (const s of statements) {
    if (s.kind === 'message' && shown.has(s.from) && shown.has(s.to)) out.push(s.arrow);
    else if (s.kind === 'rect') out.push(...drawnMessages(s.statements, shown));
    else if (s.kind === 'fragment')
      for (const sec of s.sections) out.push(...drawnMessages(sec.statements, shown));
  }
  return out;
}

describe('sequence ascii corpus properties (D100, R-ASCII-9)', () => {
  it('renders every sequence diagram that renders to SVG', () => {
    expect(cases.length).toBeGreaterThan(300);
    expect(failed).toEqual({});
  });

  it('is deterministic', () => {
    expect(perCharset((c, cs) => (c.out[cs].text === c.again[cs] ? [] : ['differs']))).toEqual({});
  });

  it('draws every participant label inside a box, and every other label', () => {
    expect(
      perCharset((c, cs) => {
        const s = readSequence(c.out[cs].text, cs, sequenceExpectedOf(c.out[cs].layout));
        return [
          ...s.missingParticipants.map((l) => `participant label in no box: ${JSON.stringify(l)}`),
          ...s.missingTexts.map((l) => `text missing: ${JSON.stringify(l)}`),
        ];
      })
    ).toEqual({});
  });

  it('draws as many arrowheads as the messages have', () => {
    expect(
      perCharset((c, cs) => {
        const { text, layout } = c.out[cs];
        const shown = new Set(layout.participants.map((p) => p.id));
        const want = drawnMessages(c.model.statements, shown).reduce((n, a) => n + headsOf(a), 0);
        const got = readSequence(text, cs, sequenceExpectedOf(layout)).heads;
        return got === want ? [] : [`${got} heads, ${want} expected`];
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

  // Pitfall 20: text never lands on a box's sides (a line crossing one merges into it).
  it('draws nothing but lines over the sides of a box', () => {
    const sides = { unicode: '│┼├┤┆┃╂┠┨', ascii: '|+:I' };
    const corners = { unicode: '┌', ascii: '+' };
    expect(
      perCharset((c, cs) => {
        const { text, layout } = c.out[cs];
        const rows = text.split('\n').map((r) => cellsOf(r));
        const found: string[] = [];
        const origin = originOf(layout);
        for (const b of layout.boxes) {
          // Layout cells to text cells: the text starts at the drawing's top-left content.
          const x = b.x - origin.x;
          const y = b.y - origin.y;
          if (rows[y]?.[x] !== corners[cs]) {
            found.push(`box ${b.ast}: no corner at row ${y + 1}, column ${x + 1}`);
            continue;
          }
          for (let j = y + 1; j < y + b.height - 1; j++)
            for (const col of [x, x + b.width - 1])
              if (!sides[cs].includes(rows[j]?.[col] ?? ' '))
                found.push(
                  `box ${b.ast}: ${JSON.stringify(rows[j]?.[col])} at row ${j + 1}, column ${col + 1}`
                );
        }
        return found;
      })
    ).toEqual({});
  });

  it('uses no Unicode line glyph or head in ASCII output', () => {
    const unicodeGlyphs = /[─-╿▲-◄●✕↼↽⇀⇁]/u;
    expect(
      perCharset((c, cs) => {
        if (cs !== 'ascii') return [];
        const labels = sequenceExpectedOf(c.out[cs].layout);
        if ([...labels.participants, ...labels.texts].some((t) => unicodeGlyphs.test(t))) return [];
        return unicodeGlyphs.test(c.out[cs].text) ? ['Unicode glyph in ASCII output'] : [];
      })
    ).toEqual({});
  });
});
