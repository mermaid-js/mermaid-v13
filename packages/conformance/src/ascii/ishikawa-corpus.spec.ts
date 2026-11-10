import { beforeAll, describe, expect, it } from 'vitest';
import { cellWidth } from '@mermaid-js/core/ascii';
import {
  detectIshikawa,
  type IshikawaCause,
  type IshikawaModel,
} from '@mermaid-js/diagram-ishikawa';
import { parsedIshikawa } from '@mermaid-js/diagram-ishikawa/testing';
import { createMermaid, MermaidError, type Mermaid, type TextRenderResult } from 'mermaid';
import { ishikawaGateCorpus } from '../ishikawa/corpus.ts';
import type { Charset } from './structure.ts';

// ASCII render properties of the ishikawa outline (#586, D498, R-ASCII-9) over the gate corpus
// (e2e fixtures, v12 spec and syntax-page strings, the cases, each in every generated variant),
// in both charsets, through the public `format: 'ascii'` API: renders every diagram that renders
// to SVG and rejects the others as SVG does; deterministic (a fresh API object draws the same
// text); `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces,
// no box glyph in ascii. Read back against the parsed model: an empty body its title alone (no
// text without one), the front-matter title centred on the first line, the effect in a closed box (a tee under its first column when it has causes),
// then one line per cause in source order, its `tree(1)` connector at its depth (`└──` for the
// last of its siblings), a trunk under every ancestor with a later sibling, and its label.

const CHARSETS: Charset[] = ['unicode', 'ascii'];

interface Case {
  id: string;
  model: IshikawaModel;
  out: Record<Charset, TextRenderResult>;
  again: Record<Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};
let rejected = 0;

const api = (): Mermaid => {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m;
};

beforeAll(async () => {
  const m = api();
  const fresh = api();
  for (const item of await ishikawaGateCorpus()) {
    if (!detectIshikawa(item.source)) continue;
    const svg = await m.render('i', item.source).then(
      () => undefined,
      (e: unknown) => e
    );
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        const call = { format: 'ascii', ascii: { charset } } as const;
        out[charset] = await m.render('i', item.source, call);
        again[charset] = (await fresh.render('i', item.source, call)).text;
      }
      if (svg !== undefined)
        failed[item.id] = `drawn as text, not as SVG: ${(svg as Error).message}`;
      else cases.push({ id: item.id, model: parsedIshikawa(item.source).model, out, again });
    } catch (e) {
      // Text is rejected only where SVG is, and the same way.
      if (!(e instanceof MermaidError) || !(svg instanceof MermaidError) || e.code !== svg.code)
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

const GLYPHS = {
  unicode: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', tee: '┬' },
  ascii: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', tee: '+' },
} as const;

/** D498's connectors: to a cause, to the last of its siblings, the trunk past an ancestor. */
const TREE = {
  unicode: { tee: '├── ', last: '└── ', bar: '│   ' },
  ascii: { tee: '|-- ', last: '`-- ', bar: '|   ' },
} as const;

const normal = (s: string): string => s.replace(/\s+/g, ' ').trim();
/** A label core label layout shows as written: no tags, entities, markdown or escapes. */
const asWritten = (s: string): boolean => /^[^<>#&*_`$\\]*$/.test(s);

interface Walked {
  readonly cause: IshikawaCause;
  /** Whether each ancestor (top-level first), and then the cause itself, is a last child. */
  readonly lasts: readonly boolean[];
}

/** Each cause in source order (pre-order). */
function walk(model: IshikawaModel): Walked[] {
  const out: Walked[] = [];
  const stack: Walked[] = [];
  const push = (causes: readonly IshikawaCause[], above: readonly boolean[]): void => {
    for (let i = causes.length - 1; i >= 0; i--)
      stack.push({ cause: causes[i]!, lasts: [...above, i === causes.length - 1] });
  };
  push(model.causes, []);
  for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
    out.push(top);
    push(top.cause.causes, top.lasts);
  }
  return out;
}

/** The lines of the drawing after the title line, when the model has a title. */
const drawing = (c: Case, cs: Charset): string[] => {
  const lines = c.out[cs].text.split('\n');
  return c.model.title?.trim() ? lines.slice(1) : lines;
};

describe('ishikawa ascii corpus properties (#586, D498, R-ASCII-9)', { timeout: 120_000 }, () => {
  it('renders every ishikawa diagram that renders to SVG, and rejects the others as SVG does', () => {
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
        const widest = Math.max(0, ...lines.map(cellWidth));
        const found: string[] = [];
        if (lines.length !== rows) found.push(`${lines.length} lines, rows ${rows}`);
        if (widest !== columns) found.push(`widest ${widest}, columns ${columns}`);
        if (/[ \t]$/m.test(text)) found.push('trailing space');
        if (text.includes('\r')) found.push('\\r in text');
        // Labels keep their own script; the drawing itself is ASCII.
        if (cs === 'ascii' && /[─-╿]/u.test(text)) found.push('box glyph in ascii');
        return found;
      })
    ).toEqual({});
  });

  it('draws an empty body as its title alone, and the front-matter title centred on the first line', () => {
    expect(
      problems((c, cs) => {
        const { text } = c.out[cs];
        const title = normal(c.model.title ?? '');
        if (!c.model.effect)
          return text === title ? [] : [`an empty body drew ${JSON.stringify(text)}`];
        if (!title) return [];
        const lines = text.split('\n');
        const first = lines[0] ?? '';
        const across = Math.max(...lines.slice(1).map(cellWidth));
        const lead = Math.max(0, Math.floor((across - cellWidth(title)) / 2));
        return first === ' '.repeat(lead) + title ? [] : [`first line ${JSON.stringify(first)}`];
      })
    ).toEqual({});
  });

  it('draws the effect in a closed box, its label inside, a tee under it only when it has causes', () => {
    expect(
      problems((c, cs) => {
        const { effect } = c.model;
        if (!effect) return [];
        const g = GLYPHS[cs];
        const [top = '', middle = '', bottom = ''] = drawing(c, cs);
        const w = cellWidth(middle);
        const found: string[] = [];
        if (top !== g.tl + g.h.repeat(w - 2) + g.tr) found.push(`top ${JSON.stringify(top)}`);
        if (!middle.startsWith(`${g.v} `) || !middle.endsWith(` ${g.v}`))
          found.push(`middle ${JSON.stringify(middle)}`);
        const rule = g.h.repeat(w - 2).split('');
        if (c.model.causes.length > 0) rule[1] = g.tee;
        if (bottom !== g.bl + rule.join('') + g.br) found.push(`bottom ${JSON.stringify(bottom)}`);
        const inside = normal(middle.slice(2, -2));
        if (asWritten(effect.text) && inside !== normal(effect.text))
          found.push(`effect ${JSON.stringify(inside)} for ${JSON.stringify(effect.text)}`);
        return found;
      })
    ).toEqual({});
  });

  it('writes one line per cause in source order, its connector at its depth, the trunks and its label', () => {
    expect(
      problems((c, cs) => {
        if (!c.model.effect) return [];
        const t = TREE[cs];
        const lines = drawing(c, cs).slice(3);
        const causes = walk(c.model);
        const found: string[] = [];
        if (lines.length !== causes.length)
          found.push(`${lines.length} cause lines for ${causes.length} causes`);
        causes.forEach(({ cause, lasts }, i) => {
          const line = lines[i] ?? '';
          const trunks = lasts
            .slice(0, -1)
            .map((last) => (last ? ' '.repeat(t.bar.length) : t.bar))
            .join('');
          const head = `  ${trunks}${lasts.at(-1) ? t.last : t.tee}`;
          if (!`${line} `.startsWith(head)) {
            found.push(
              `${cause.ast}: ${JSON.stringify(line)} does not start ${JSON.stringify(head)}`
            );
            return;
          }
          const label = normal(line.slice(head.length));
          if (asWritten(cause.text) && label !== normal(cause.text))
            found.push(`${cause.ast}: ${JSON.stringify(label)} for ${JSON.stringify(cause.text)}`);
        });
        return found;
      })
    ).toEqual({});
  });
});
