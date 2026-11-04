import { beforeAll, describe, expect, it } from 'vitest';
import { cellWidth } from '@mermaid-js/core/ascii';
import type { ArrowKind, SequenceModel, SequenceStatement } from '@mermaid-js/diagram-sequence';
import { MermaidError } from 'mermaid';
import { sequenceCorpus } from '../sequence/corpus.ts';
import { asTest, sequenceApi } from '../sequence/render-api.ts';
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

interface Case {
  id: string;
  model: SequenceModel;
  out: Record<Charset, SequenceAsciiResult>;
  again: Record<Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};

beforeAll(async () => {
  const svg = await sequenceApi();
  for (const item of await sequenceCorpus()) {
    const source = asTest(item.source);
    if (source === item.source) continue;
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
