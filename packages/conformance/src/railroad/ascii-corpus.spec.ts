import { beforeAll, describe, expect, it } from 'vitest';
import { cellMeasurer, graphemes } from '@mermaid-js/core/ascii';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { cellProfile } from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import {
  layoutRailroad,
  parseRailroad,
  type RailroadExpressionLayout,
  type RailroadLayout,
  type RailroadModel,
} from '@mermaid-js/diagram-railroad';
import { railroadLayoutViolations, railroadSectionOf } from '@mermaid-js/diagram-railroad/testing';
import { createMermaid, MermaidError, type Mermaid, type TextRenderResult } from 'mermaid';
import { notationOf, railroadGateCorpus } from './corpus.ts';

// ASCII render properties over the railroad gate corpus (e2e fixtures, v12 spec strings, the
// cases and the recovery set, each also with CRLF and comment lines), in both charsets, through
// the public `format: 'ascii'` API (#617, D518, R-ASCII-9): renders every diagram that renders to
// SVG and rejects only what SVG rejects; deterministic; `rows` lines, none wider than `columns`
// and one exactly that wide, no trailing spaces, no box glyph in `ascii`. The layout in cells
// keeps the layout invariants (#612), and the text is read back against it: every terminal,
// nonterminal and special is a closed box of its kind's corners where the layout puts it, its
// text inside on the track's row with a tee on each side where the track enters and leaves;
// every rule starts with `name =` and has its two markers; and (unicode) the drawn track joins
// each rule's start marker to its end marker.

type Charset = 'unicode' | 'ascii';
const CHARSETS: Charset[] = ['unicode', 'ascii'];

interface Case {
  id: string;
  model: RailroadModel;
  layout: Record<Charset, RailroadLayout>;
  out: Record<Charset, TextRenderResult>;
  again: Record<Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};
let rejected = 0;
let theme: Theme;

/** The layout the hook draws: the plugin's, in cells (the `compact` preset). */
function cellLayout(model: RailroadModel, section: Record<string, unknown>): RailroadLayout {
  const config = { railroad: section, ascii: { padding: 'compact' } } as unknown as ResolvedConfig;
  return layoutRailroad(model, { config, measurer: cellMeasurer, theme, units: cellProfile() });
}

const api = (): Mermaid => {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m;
};

beforeAll(async () => {
  theme = createTheme(await loadTheme('default'), {});
  const first = api();
  const fresh = api();
  for (const item of await railroadGateCorpus()) {
    if (notationOf(item.source) === undefined) continue;
    const pre = preprocess(item.source);
    const parse = parseRailroad(item.source, { preprocessed: pre });
    const parses = !parse.diagnostics.some((d) => d.severity === 'error');
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        const call = { format: 'ascii', config: { ascii: { charset } } } as const;
        out[charset] = await first.render('mermaid-0', item.source, call);
        again[charset] = (await fresh.render('mermaid-0', item.source, call)).text;
      }
      const layout = cellLayout(parse.model, railroadSectionOf(pre));
      cases.push({
        id: item.id,
        model: parse.model,
        layout: { unicode: layout, ascii: layout },
        out,
        again,
      });
      if (!parses) failed[item.id] = 'drawn although the parse has errors';
    } catch (e) {
      // Text is rejected only where SVG is too (preprocessing errors included).
      const svg = await first.render('mermaid-0', item.source).then(
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

/** A line as cells: a wide grapheme takes its cell and an empty one after it. */
function cells(line: string): string[] {
  const out: string[] = [];
  for (const g of graphemes(line)) {
    if (g.width === 0) out[out.length - 1] += g.text;
    else out.push(g.text, ...(g.width === 2 ? [''] : []));
  }
  return out;
}

/** The text as rows of cells, and the cell at (x, y) (a space outside). */
function grid(text: string): (x: number, y: number) => string {
  const rows = text.split('\n').map(cells);
  return (x, y) => rows[y]?.[x] ?? ' ';
}

/** Each leaf of a rule with its offset in the diagram. */
function leaves(
  layout: RailroadLayout,
  fn: (e: RailroadExpressionLayout, ox: number, oy: number) => void
): void {
  for (const r of layout.rules) {
    const walk = (e: RailroadExpressionLayout, ox: number, oy: number): void => {
      if (e.box) fn(e, ox, oy);
      for (const c of e.children) walk(c, ox + c.x, oy + c.y);
    };
    walk(r.definition, r.origin.x + r.definition.x, r.origin.y + r.definition.y);
  }
}

/** The corners of a box of `kind`, top left, top right, bottom left, bottom right. */
const CORNERS: Record<Charset, Record<'terminal' | 'nonterminal' | 'special', string>> = {
  unicode: { terminal: '╭╮╰╯', nonterminal: '┌┐└┘', special: '┌┐└┘' },
  ascii: { terminal: '/\\\\/', nonterminal: '++++', special: '++++' },
};
const SIDES: Record<Charset, Record<'terminal' | 'nonterminal' | 'special', [string, string]>> = {
  unicode: { terminal: ['─', '│'], nonterminal: ['─', '│'], special: ['┄', '┆'] },
  ascii: { terminal: ['-', '|'], nonterminal: ['-', '|'], special: ['.', ':'] },
};
const TEE: Record<Charset, [string, string]> = { unicode: ['┤', '├'], ascii: ['+', '+'] };
const MARKER: Record<Charset, string> = { unicode: '●', ascii: 'o' };

/** A text as one row: control characters are spaces (`cellText`). */
// eslint-disable-next-line no-control-regex -- control characters are what it replaces
const oneRow = (s: string): string => s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ');

/** The arms of each unicode track glyph: up, right, down, left. */
const ARMS: Record<string, string> = {
  '─': 'rl',
  '┄': 'rl',
  '│': 'ud',
  '┆': 'ud',
  '┌': 'rd',
  '╭': 'rd',
  '┐': 'ld',
  '╮': 'ld',
  '└': 'ur',
  '╰': 'ur',
  '┘': 'ul',
  '╯': 'ul',
  '├': 'udr',
  '┤': 'udl',
  '┬': 'rld',
  '┴': 'rlu',
  '┼': 'udrl',
  '●': 'rl',
};
const STEP: Record<string, [number, number, string]> = {
  u: [0, -1, 'd'],
  d: [0, 1, 'u'],
  r: [1, 0, 'l'],
  l: [-1, 0, 'r'],
};

/** Whether the drawn track (box frames included) joins (sx, sy) to (ex, ey). */
function joined(
  at: (x: number, y: number) => string,
  sx: number,
  sy: number,
  ex: number,
  ey: number
) {
  const seen = new Set<string>([`${sx},${sy}`]);
  const todo: [number, number][] = [[sx, sy]];
  for (let next = todo.pop(); next; next = todo.pop()) {
    const [x, y] = next;
    if (x === ex && y === ey) return true;
    for (const arm of ARMS[at(x, y)] ?? '') {
      const [dx, dy, back] = STEP[arm]!;
      const [nx, ny] = [x + dx, y + dy];
      if (!(ARMS[at(nx, ny)] ?? '').includes(back) || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      todo.push([nx, ny]);
    }
  }
  return false;
}

describe('railroad ascii corpus properties (D518, R-ASCII-9)', { timeout: 120_000 }, () => {
  it('renders every railroad diagram that renders to SVG, and rejects the others with SYNTAX', () => {
    console.log(`railroad ascii corpus: ${cases.length} drawn, ${rejected} rejected as in SVG`);
    expect(cases.length).toBeGreaterThan(500);
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
        if (/^\s*$/.test(lines[0] ?? 'x')) found.push('a blank first line');
        if (cs === 'ascii' && /[─-╿●]/u.test(text)) found.push('box glyph in ascii');
        return found;
      })
    ).toEqual({});
  });

  it('lays out in cells within the layout invariants', () => {
    expect(
      problems((c, cs) => (cs === 'ascii' ? [] : railroadLayoutViolations(c.model, c.layout[cs])))
    ).toEqual({});
  });

  it('draws every box of its kind where the layout puts it, its text inside between two tees', () => {
    let boxes = 0;
    expect(
      problems((c, cs) => {
        const layout = c.layout[cs];
        const at = grid(c.out[cs].text);
        const dy = layout.rules[0]?.origin.y ?? 0;
        const found: string[] = [];
        leaves(layout, (e, ox, oy) => {
          boxes++;
          const kind = e.kind as 'terminal' | 'nonterminal' | 'special';
          const box = e.box!;
          const x0 = Math.floor(ox + box.x);
          const y0 = Math.floor(oy + box.y - dy);
          const x1 = Math.floor(ox + box.x + box.width);
          const y1 = Math.floor(oy + box.y + box.height - dy);
          const row = Math.floor(oy + e.up - dy);
          const [h, v] = SIDES[cs][kind];
          const corners = [at(x0, y0), at(x1, y0), at(x0, y1), at(x1, y1)].join('');
          const bad: string[] = [];
          if (corners !== CORNERS[cs][kind]) bad.push(`corners ${corners}`);
          for (let x = x0 + 1; x < x1; x++)
            if (at(x, y0) !== h || at(x, y1) !== h) bad.push(`border at ${x}`);
          for (let y = y0 + 1; y < y1; y++) {
            const [l, r] = y === row ? TEE[cs] : [v, v];
            if (at(x0, y) !== l || at(x1, y) !== r) bad.push(`side at row ${y}`);
          }
          let inside = '';
          for (let x = x0 + 1; x < x1; x++) inside += at(x, row);
          if (inside.trim() !== oneRow(e.text!.text).trim()) bad.push(JSON.stringify(inside));
          if (bad.length > 0) found.push(`${e.ast} ${kind}: ${bad.slice(0, 2).join(', ')}`);
        });
        return found;
      })
    ).toEqual({});
    expect(boxes).toBeGreaterThan(5_000);
  });

  it('starts each rule with `name =` and draws its two markers on the track', () => {
    expect(
      problems((c, cs) => {
        const layout = c.layout[cs];
        const lines = c.out[cs].text.split('\n');
        const at = grid(c.out[cs].text);
        const dy = layout.rules[0]?.origin.y ?? 0;
        const found: string[] = [];
        for (const r of layout.rules) {
          const row = Math.floor(r.origin.y + r.baseline - dy);
          if (!lines[row]?.startsWith(`${oneRow(r.name)} =`)) found.push(`${r.ast}: no name`);
          for (const m of [r.start, r.end])
            if (at(Math.floor(r.origin.x + m.cx), row) !== MARKER[cs])
              found.push(`${r.ast}: no marker at ${m.cx}`);
        }
        return found;
      })
    ).toEqual({});
  });

  it('joins each rule’s start marker to its end marker along the drawn track (unicode)', () => {
    expect(
      problems((c, cs) => {
        if (cs === 'ascii') return [];
        const layout = c.layout[cs];
        const at = grid(c.out[cs].text);
        const dy = layout.rules[0]?.origin.y ?? 0;
        return layout.rules.flatMap((r) => {
          const row = Math.floor(r.origin.y + r.baseline - dy);
          const sx = Math.floor(r.origin.x + r.start.cx);
          const ex = Math.floor(r.origin.x + r.end.cx);
          return joined(at, sx, row, ex, row) ? [] : [`${r.ast}: the track breaks`];
        });
      })
    ).toEqual({});
  });
});
