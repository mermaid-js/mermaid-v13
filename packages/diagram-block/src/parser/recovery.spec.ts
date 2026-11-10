import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import type { Block } from '../model.ts';
import { parseBlock } from './index.ts';
import { JISON_NAMES, T } from './tokens.ts';

/**
 * Recovery set (R-PARSE-4): diagrams with N independent errors give N error diagnostics, each on
 * the line where the error was planted, and the blocks around them still reach the model. No
 * message names a token or a grammar rule (R-ERR-5).
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Block ids that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'an unquoted label, then a markdown label',
    lines: ['block', '  a[x]', '  b["`md`"]', '  c'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['a', 'b', 'c'],
  },
  {
    name: 'an edge to a keyword, then a stray span',
    lines: ['block', '  a --> end', '  b', '  "x"', '  c'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a', 'b', 'c'],
  },
  {
    name: 'a span after a chain, then a span after a space',
    lines: ['block', '  a --> b:2', '  space:2:3', '  c'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['a', 'b', 'c'],
  },
  {
    name: 'an end with nothing open, then one more',
    lines: ['block', '  a', '  end', '  b', '  end', '  c'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['a', 'b', 'c'],
  },
  {
    name: 'two composites left open',
    lines: ['block', '  block:g', '    a', '  block', '    b'],
    errors: [
      ['UNCLOSED_BLOCK', 2],
      ['UNCLOSED_BLOCK', 4],
    ],
    keeps: ['g', 'a', 'b'],
  },
  {
    name: 'an empty composite, then an empty anonymous one',
    lines: ['block', '  block:g', '  end', '  block', '  end', '  a'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 5],
    ],
    keeps: ['g', 'a'],
  },
  {
    name: 'a composite header on the next line, with an empty body',
    lines: ['block', '  block:', '    a', '  end', '  b'],
    errors: [['UNEXPECTED', 4]],
    keeps: ['a', 'b'],
  },
  {
    name: 'a failed composite header still takes its end',
    lines: ['block', '  block:g[x]', '    a', '  end', '  b:x', '  c'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 5],
    ],
    keeps: ['g', 'a', 'b', 'c'],
  },
  {
    name: 'classDef DEFAULT, then a classDef with a bad name',
    lines: ['block', '  classDef DEFAULT fill:red', '  classDef #a fill:red', '  a'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['a'],
  },
  {
    name: 'class and style with bad ids',
    lines: ['block', '  a', '  class -a c', '  style -a fill:red', '  b'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a', 'b'],
  },
  {
    name: 'accTitle and accDescr, which block has not',
    lines: ['block', '  accTitle: t', '  a', '  accDescr: d', '  b'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a', 'b'],
  },
  {
    name: 'reserved words',
    lines: ['block', '  default', '  a', '  linkStyle', '  b', '  interpolate'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
      ['UNEXPECTED', 6],
    ],
    keeps: ['a', 'b'],
  },
  {
    name: 'a block arrow with no direction, then a bad direction',
    lines: ['block', '  a<["x"]>()', '  b<["y"]>(north)', '  c'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['a', 'b', 'c'],
  },
  {
    name: 'a shape without an id, then a block arrow without one',
    lines: ['block', '  ["x"]', '  a:2', '  <["y"]>(up)', '  b'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a', 'b'],
  },
  {
    name: 'a quoted text where a statement goes, then an empty label',
    lines: ['block', '  "x"', '  a', '  b[""]', '  c'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a', 'b', 'c'],
  },
  {
    name: 'an edge label with no closing link, then a lone link',
    lines: ['block', '  a -- "x" b', '  c', '  --> d', '  e'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['a'],
  },
  {
    name: 'a markdown edge label, then a labelled edge with no label',
    lines: ['block', '  a -- "`x`" --> b', '  c', '  d -- e', '  f'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNCLOSED_LABEL', 4],
    ],
    keeps: ['a', 'c', 'd'],
  },
  {
    name: 'a lone lt and equals, each on its line',
    lines: ['block', '  a < b', '  c', '  d = e', '  f'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a', 'c', 'd', 'f'],
  },
  {
    name: 'a blank before a closer, then a shape left open to the end',
    lines: ['block', '  a["x" ]', '  b', '  c["y"', '  d'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNCLOSED_SHAPE', 4],
    ],
    keeps: ['a', 'b', 'c'],
  },
  {
    name: 'a span with no digits, then negative columns',
    lines: ['block', '  a:x', '  b', '  columns -1', '  c'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a', 'b', 'c'],
  },
  {
    name: 'no header',
    lines: ['blockchain', '  a', '  b'],
    errors: [['UNEXPECTED', 1]],
    keeps: ['a', 'b'],
  },
  {
    name: 'an unclosed string at the end, in a composite',
    lines: ['block', '  a b:x', '  block:g', '    c["text'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNCLOSED_STRING', 4],
    ],
    keeps: ['a', 'b', 'g', 'c'],
  },
  {
    name: 'an edge label left open to the end',
    lines: ['block', '  a', '  b -- c'],
    errors: [['UNCLOSED_LABEL', 3]],
    keeps: ['a', 'b'],
  },
  {
    name: 'only a header',
    lines: ['block'],
    errors: [['UNEXPECTED', 1]],
  },
];

// Token names: jison terminals and v13 kind names that are compounds (`NodeDStart`).
const BANNED = new RegExp(
  `\\b(?:${[
    // `DEFAULT` is also what an author writes (`classDef DEFAULT`), so a message may quote it.
    ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n) && n !== 'DEFAULT'),
    ...Object.keys(T).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
    'nodeStatement',
    'blockStatement',
    'nodeShapeNLabel',
    'dirList',
    'columnsStatement',
    'cssClassStatement',
    'styleStatement',
    'classDefStatement',
  ].join('|')})\\b`
);

const ids = (blocks: readonly Block[]): string[] =>
  blocks.flatMap((b) => [b.id, ...ids(b.children)]);

describe('block recovery', () => {
  it('has at least 20 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(CASES)('$name', ({ lines, errors, keeps }) => {
    const src = lines.join('\n');
    const r = parseBlock(src);
    const index = new LineIndex(src);
    const got = r.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d): [string, number] => [d.code, index.position(d.range.start).line + 1]);
    expect(got).toEqual(errors);
    for (const d of r.diagnostics) expect(d.message).not.toMatch(BANNED);
    const all = ids(r.model.blocks);
    for (const k of keeps ?? []) expect(all).toContain(k);
  });
});
