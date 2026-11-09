import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseSankey } from '../index.ts';
import { JISON_NAMES, SankeyKind } from './tokens.ts';

/**
 * Recovery set (R-PARSE-4): diagrams with N independent errors give N error diagnostics, each
 * on the line where the error was planted, and the rows around them still reach the model. No
 * message names a token or a grammar rule (R-ERR-5).
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Rows (`source->target`) that must still be in the model. */
  keeps?: string[];
}

const U = 'UNEXPECTED';
const CASES: Case[] = [
  {
    name: 'too few and too many fields',
    lines: ['sankey', 'a,b', 'c,d,1', 'e,f,1,2', 'g,h,1'],
    errors: [
      [U, 2],
      [U, 4],
    ],
    keeps: ['c->d', 'g->h'],
  },
  {
    name: 'an empty field in each position',
    lines: ['sankey', ',b,1', 'a,,1', 'a,b,', 'x,y,1'],
    errors: [
      [U, 2],
      [U, 3],
      [U, 4],
    ],
    keeps: ['x->y'],
  },
  {
    name: 'a trailing comma, then a field of one',
    lines: ['sankey', 'a,b,1,', 'c', 'd,e,2'],
    errors: [
      [U, 2],
      [U, 3],
    ],
    keeps: ['d->e'],
  },
  {
    name: 'blanks and text after closing quotes',
    lines: ['sankey', '"a" ,b,1', '"c"x,d,1', 'e,"f" ,1', 'g,h,"1"2', 'i,j,1'],
    errors: [
      [U, 2],
      [U, 3],
      [U, 4],
      [U, 5],
    ],
    keeps: ['i->j'],
  },
  {
    name: 'empty quotes in each position',
    lines: ['sankey', '"",b,1', 'a,"",1', 'a,b,""', 'c,d,1'],
    errors: [
      [U, 2],
      [U, 3],
      [U, 4],
    ],
    keeps: ['c->d'],
  },
  {
    name: 'characters outside printable ASCII in names and values',
    lines: ['sankey', 'Zürich,b,1', 'a,é,1', 'a,b,1é', 'ok,fine,1', 'a\tb,c,1'],
    errors: [
      [U, 2],
      [U, 3],
      [U, 4],
      [U, 6],
    ],
    keeps: ['ok->fine'],
  },
  {
    name: 'a tab and a non-breaking space inside quotes',
    lines: ['sankey', '"a\tb",c,1', '"a b",c,1', 'd,e,1'],
    errors: [
      [U, 2],
      [U, 3],
    ],
    keeps: ['d->e'],
  },
  {
    name: 'entities',
    lines: ['sankey', 'a#9829;b,c,1', '#amp;,b,1', 'x,y,1'],
    errors: [
      [U, 2],
      [U, 3],
    ],
    keeps: ['x->y'],
  },
  {
    name: 'lines of blanks between rows',
    lines: ['sankey', 'a,b,1', '   ', 'c,d,1', '  ', 'e,f,1'],
    errors: [
      [U, 3],
      [U, 5],
    ],
    keeps: ['a->b', 'c->d', 'e->f'],
  },
  {
    name: 'blanks after the header, then a short row',
    lines: ['sankey   ', 'a,b,1', 'c,d'],
    errors: [
      [U, 1],
      [U, 3],
    ],
    keeps: ['a->b'],
  },
  {
    name: 'text after the header, then a good row',
    lines: ['sankey a,b,1', 'c,d,1', 'e,f'],
    errors: [
      [U, 1],
      [U, 3],
    ],
    keeps: ['c->d'],
  },
  {
    name: 'no header, then a later one',
    lines: ['sankeyx', 'sankey', 'a,b,1', 'c'],
    errors: [
      [U, 1],
      [U, 4],
    ],
    keeps: ['a->b'],
  },
  {
    name: 'a second header and title statements in the body',
    lines: ['sankey', 'sankey', 'a,b,1', 'title T', 'accTitle: x', 'c,d,1'],
    errors: [
      [U, 2],
      [U, 4],
      [U, 5],
    ],
    keeps: ['a->b', 'c->d'],
  },
  {
    name: 'a quote in the middle of a field, which runs to the end',
    lines: ['sankey', 'a,b,1', 'c,d,1""', 'e,f,1'],
    errors: [[U, 3]],
    keeps: ['a->b'],
  },
  {
    name: 'an unclosed quote at the end',
    lines: ['sankey', 'a,b,1', 'c,d', 'e,f,"1'],
    errors: [
      [U, 3],
      ['UNCLOSED_STRING', 4],
    ],
    keeps: ['a->b'],
  },
  {
    name: 'an unclosed quote swallowing the rest',
    lines: ['sankey', 'a,,1', '"b,c,1', 'd,e,1'],
    errors: [
      [U, 2],
      ['UNCLOSED_STRING', 3],
    ],
  },
  {
    name: 'two self-links and a cycle among syntax errors',
    lines: ['sankey', 'a,a,1', 'b,c', 'c,d,1', 'd,c,1', 'e,f,1,', 'g,g,1'],
    errors: [
      ['SANKEY_CYCLE', 2],
      [U, 3],
      ['SANKEY_CYCLE', 4],
      [U, 6],
      ['SANKEY_CYCLE', 7],
    ],
    keeps: ['a->a', 'c->d', 'd->c', 'g->g'],
  },
  {
    name: 'a cycle closed after an error in between',
    lines: ['sankey', 'a,b,1', 'b,c', 'b,c,1', 'c,a,1'],
    errors: [
      ['SANKEY_CYCLE', 2],
      [U, 3],
    ],
    keeps: ['a->b', 'b->c', 'c->a'],
  },
  {
    name: 'errors over CRLF lines and comment lines',
    lines: ['sankey\r', 'a,b\r', '%% note\r', 'c,d,1\r', 'e,f,1,2\r', 'g,h,1'],
    errors: [
      [U, 2],
      [U, 5],
    ],
    keeps: ['c->d', 'g->h'],
  },
  {
    name: 'errors after a directive and front matter',
    lines: ['---', 'title: T', '---', '%%{init: {}}%%', 'sankey', 'a,b', 'c,d,1', ',e,1'],
    errors: [
      [U, 6],
      [U, 8],
    ],
    keeps: ['c->d'],
  },
  {
    name: 'a quoted line break before a bad row',
    lines: ['sankey', '"a', 'b",c,1', 'd,e', 'f,g,1'],
    errors: [[U, 4]],
    keeps: ['a\nb->c', 'f->g'],
  },
  {
    name: 'invalid values warn, they are not errors',
    lines: ['sankey', 'a,b,abc', 'b,c', 'c,d,-1', 'd,e,1;'],
    errors: [[U, 3]],
    keeps: ['a->b', 'c->d', 'd->e'],
  },
];

// Token names: jison terminals with `_` or all capitals, and v13 kind names that are compounds
// (`OpenQuote`); grammar rules with `_`.
const BANNED = new RegExp(
  `\\b(?:${[
    ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
    ...Object.keys(SankeyKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
    'csv_tail',
    'opt_eof',
    'non_escaped',
  ].join('|')})\\b`
);

describe('sankey recovery', () => {
  it('holds at least 20 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(CASES)('$name', ({ lines, errors, keeps }) => {
    const src = lines.join('\n');
    const r = parseSankey(src);
    const index = new LineIndex(src);
    const got = r.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d): [string, number] => [d.code, index.position(d.range.start).line + 1]);
    expect(got).toEqual(errors);
    for (const d of r.diagnostics) expect(d.message).not.toMatch(BANNED);
    const rows = r.model.links.map((l) => `${l.source}->${l.target}`);
    for (const k of keeps ?? []) expect(rows).toContain(k);
  });
});
