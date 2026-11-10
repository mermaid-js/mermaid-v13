import { beforeAll, describe, expect, it } from 'vitest';
import { graphemes } from '@mermaid-js/core/ascii';
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  detectPacket,
  packetConfig,
  packetSectionOf,
  parsePacket,
  type PacketModel,
} from '@mermaid-js/diagram-packet';
import { MermaidError, type TextRenderResult } from 'mermaid';
import { packetGateCorpus } from '../packet/corpus.ts';
import { packetApi } from '../packet/render-api.ts';
import type { Charset } from './structure.ts';

// ASCII render properties over the packet gate corpus (e2e fixtures, v12 spec strings and the
// cases, each also with CRLF and comment lines), in both charsets, through the public
// `format: 'ascii'` API (#464, D347, R-ASCII-9): renders every diagram that parses, and rejects
// only what SVG rejects; deterministic; `rows` lines, none wider than `columns` and one exactly that
// wide, no trailing spaces, no box glyph in ascii. Read back against the parsed model: every
// piece of every row is a closed box two columns a bit wide on the row's own lines, its label
// inside (whole or cut with the charset's ellipsis), the bit numbers above each row where the
// SVG puts them, one left out only where it would touch the one before, and the title last.

const CHARSETS: Charset[] = ['unicode', 'ascii'];

interface Case {
  id: string;
  model: PacketModel;
  showBits: boolean;
  descending: boolean;
  out: Record<Charset, TextRenderResult>;
  again: Record<Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};
let rejected = 0;

beforeAll(async () => {
  const api = await packetApi();
  const fresh = await packetApi();
  for (const item of await packetGateCorpus()) {
    if (!detectPacket(item.source)) continue;
    const pre = preprocess(item.source);
    const section = packetSectionOf(pre);
    const parse = parsePacket(item.source, { preprocessed: pre, config: section });
    const parses = !parse.diagnostics.some((d) => d.severity === 'error');
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        const call = { format: 'ascii', config: { ascii: { charset } } } as const;
        out[charset] = await api.render('mermaid-0', item.source, call);
        again[charset] = (await fresh.render('mermaid-0', item.source, call)).text;
      }
      const { showBits, bitOrder } = packetConfig(section).config;
      cases.push({
        id: item.id,
        model: parse.model,
        showBits,
        descending: bitOrder === 'descending',
        out,
        again,
      });
      if (!parses) failed[item.id] = 'drawn although the parse has errors';
    } catch (e) {
      // Text is rejected only where SVG is too (preprocessing errors included).
      const svg = await api.render('mermaid-0', item.source).then(
        () => undefined,
        (x: unknown) => x
      );
      if (!(e instanceof MermaidError) || e.code !== 'SYNTAX' || svg === undefined)
        failed[item.id] = String(e);
      else rejected++;
    }
  }
}, 600_000);

/** `{ id: problems }` for the cases where `check` finds something, in either charset. */
function problems(check: (c: Case, charset: Charset) => string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of cases) {
    const found = CHARSETS.flatMap((cs) => check(c, cs).map((p) => `${cs}: ${p}`));
    if (found.length > 0) out[c.id] = found.slice(0, 5);
  }
  return out;
}

/**
 * A line as cells: a wide grapheme takes its cell and an empty one after it. Several properties
 * read the same lines, so each line is split once (callers only read the array).
 */
const cellsOf = new Map<string, string[]>();
function cells(line: string): string[] {
  let out = cellsOf.get(line);
  if (out === undefined) cellsOf.set(line, (out = splitCells(line)));
  return out;
}

function splitCells(line: string): string[] {
  const out: string[] = [];
  for (const g of graphemes(line)) {
    if (g.width === 0) out[out.length - 1] += g.text;
    else out.push(g.text, ...(g.width === 2 ? [''] : []));
  }
  return out;
}

const GLYPHS = {
  unicode: { h: '─', v: '│', mark: '…' },
  ascii: { h: '-', v: '|', mark: '~' },
} as const;

/** Where row `r`'s box lines start (its top border). */
const topOf = (c: Case, r: number): number => (c.showBits ? 4 * r + 1 : 2 * r);

const normal = (s: string): string => s.replace(/\s+/g, ' ').trim();
/** A label core label layout shows as written: no tags, entities, markdown or escapes. */
const asWritten = (s: string): boolean => /^[^<>#&*_`$\\]*$/.test(s);

describe('packet ascii corpus properties (D347, R-ASCII-9)', { timeout: 120_000 }, () => {
  it('renders every packet diagram that renders to SVG, and rejects the others with SYNTAX', () => {
    expect(cases.length).toBeGreaterThan(250);
    expect(rejected).toBeGreaterThan(0);
    expect(failed).toEqual({});
  });

  it('is deterministic: a fresh API object draws the same text', () => {
    expect(problems((c, cs) => (c.out[cs].text === c.again[cs] ? [] : ['differs']))).toEqual({});
  });

  it('has `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces', () => {
    expect(
      problems((c, cs) => {
        const { text, rows, columns } = c.out[cs];
        const lines = text === '' ? [] : text.split('\n');
        const widest = Math.max(0, ...lines.map((l) => cells(l).length));
        const found: string[] = [];
        if (lines.length !== rows) found.push(`${lines.length} lines, rows ${rows}`);
        if (widest !== columns) found.push(`widest ${widest}, columns ${columns}`);
        if (/ $/m.test(text)) found.push('trailing space');
        // Labels keep their own script; the drawing itself is ASCII.
        if (cs === 'ascii' && /[─-╿…]/u.test(text)) found.push('box glyph in ascii');
        return found;
      })
    ).toEqual({});
  });

  it('draws every piece as a closed box, two columns a bit, on its row’s lines', () => {
    expect(
      problems((c, cs) => {
        const lines = c.out[cs].text.split('\n').map(cells);
        const { h, v } = GLYPHS[cs];
        const found: string[] = [];
        c.model.rows.forEach((pieces, r) => {
          const y = topOf(c, r);
          for (const p of pieces) {
            const bits = p.end - p.start + 1;
            const first = p.start % c.model.bitsPerRow;
            const x = 2 * (c.descending ? c.model.bitsPerRow - first - bits : first);
            const right = x + 2 * bits;
            const at = (dy: number, dx: number): string => lines[y + dy]?.[dx] ?? ' ';
            const sides = [at(1, x), at(1, right)].every((g) => g === v);
            let closed = sides;
            // A shared border also carries the junctions of the row above or below.
            const across = (g: string): boolean => g !== ' ' && g !== v;
            for (let i = x + 1; i < right && closed; i++)
              closed = c.showBits
                ? at(0, i) === h && at(2, i) === h
                : across(at(0, i)) && across(at(2, i));
            // Corners and junctions: neither blank nor a straight run.
            for (const dy of [0, 2])
              for (const dx of [x, right]) if ([' ', h, v].includes(at(dy, dx))) closed = false;
            // No border inside the box.
            for (let i = x + 1; i < right && closed; i++) if (at(1, i) === v) closed = false;
            if (!closed) found.push(`row ${r}, bits ${p.start}-${p.end}: not a closed box`);
          }
        });
        return found;
      })
    ).toEqual({});
  });

  it('writes each label inside its box, whole or cut with the ellipsis', () => {
    expect(
      problems((c, cs) => {
        const lines = c.out[cs].text.split('\n').map(cells);
        const { mark } = GLYPHS[cs];
        const found: string[] = [];
        c.model.rows.forEach((pieces, r) => {
          const y = topOf(c, r) + 1;
          for (const p of pieces) {
            const label = c.model.fields[p.field]!.label;
            if (!asWritten(label)) continue;
            const bits = p.end - p.start + 1;
            const first = p.start % c.model.bitsPerRow;
            const x = 2 * (c.descending ? c.model.bitsPerRow - first - bits : first);
            const inside = normal((lines[y] ?? []).slice(x + 1, x + 2 * bits).join(''));
            const want = normal(label);
            const ok =
              inside === want ||
              (inside.endsWith(mark) && want.startsWith(inside.slice(0, -mark.length).trimEnd()));
            if (!ok) found.push(`row ${r}: ${JSON.stringify(inside)} for ${JSON.stringify(want)}`);
          }
        });
        return found;
      })
    ).toEqual({});
  });

  // D347 puts the numbers where the SVG does: a one-bit piece's number centred over its cell,
  // a wider piece's leading bit from its first cell and its trailing bit up to its last (the
  // higher bit leading when `descending`). Left to right, a number is left out only when it
  // would start before the column after the blank that follows the last number drawn.
  it('writes each row’s bit numbers where they belong, leaving one out only where it would touch the one before', () => {
    expect(
      problems((c, cs) => {
        if (!c.showBits) return [];
        const lines = c.out[cs].text.split('\n');
        const found: string[] = [];
        c.model.rows.forEach((pieces, r) => {
          const line = lines[topOf(c, r) - 1] ?? '';
          if (!/^[ 0-9]*$/.test(line)) return void found.push(`row ${r}: ${JSON.stringify(line)}`);
          const drawn = [...line.matchAll(/[0-9]+/g)].map((m) => ({ x: m.index, text: m[0] }));
          const wanted = pieces
            .flatMap((p) => {
              const bits = p.end - p.start + 1;
              const first = p.start % c.model.bitsPerRow;
              const x = 2 * (c.descending ? c.model.bitsPerRow - first - bits : first);
              const [lead, trail] = c.descending ? [p.end, p.start] : [p.start, p.end];
              if (bits === 1) {
                const t = String(lead);
                return [{ x: Math.max(0, x + 1 - Math.floor((t.length - 1) / 2)), text: t }];
              }
              const t = String(trail);
              return [
                { x: x + 1, text: String(lead) },
                { x: x + 2 * bits - t.length, text: t },
              ];
            })
            .sort((a, b) => a.x - b.x);
          const key = (n: { x: number; text: string }) => `${n.x}:${n.text}`;
          const want = new Set(wanted.map(key));
          for (const d of drawn)
            if (!want.has(key(d)))
              found.push(`row ${r}: ${d.text} at column ${d.x} is out of place`);
          const shown = new Set(drawn.map(key));
          let last: { x: number; text: string } | undefined;
          for (const n of wanted) {
            if (shown.has(key(n))) {
              last = n;
              continue;
            }
            const touches = last !== undefined && n.x <= last.x + last.text.length;
            if (!touches)
              found.push(`row ${r}: ${n.text} left out at column ${n.x} with room for it`);
          }
        });
        return found;
      })
    ).toEqual({});
  });

  it('puts the title on the last line', () => {
    expect(
      problems((c, cs) => {
        if (!c.model.title || !asWritten(c.model.title)) return [];
        const last = c.out[cs].text.split('\n').at(-1) ?? '';
        return normal(last) === normal(c.model.title) ? [] : [`last line ${JSON.stringify(last)}`];
      })
    ).toEqual({});
  });
});
