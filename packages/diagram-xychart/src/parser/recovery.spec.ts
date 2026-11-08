import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseXyChart } from '../index.ts';
import { JISON_NAMES, T } from './tokens.ts';

/**
 * Recovery set (R-PARSE-4): charts with N independent errors give N error diagnostics, each on
 * the line where the error was planted, and the statements around them still reach the model.
 * No message names a token or a grammar rule (R-ERR-5).
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Plot names and categories that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'a title and an axis with nothing after the keyword',
    lines: ['xychart', 'title', 'x-axis', 'bar kept [1]'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['kept'],
  },
  {
    name: 'plots without values, with empty brackets and with a missing value',
    lines: ['xychart', 'bar a', 'line b []', 'bar c [1, , 2]', 'line kept [3]'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['kept'],
  },
  {
    name: 'values that are no numbers',
    lines: ['xychart', 'bar a [1e3]', 'bar b [x]', 'line c [1, -4aa5]', 'bar kept [1]'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['kept'],
  },
  {
    name: 'unbalanced brackets in plots and categories',
    lines: [
      'xychart',
      'x-axis [a [ b]',
      'bar a [1 [ 2]',
      'line b [1] 2]',
      'x-axis [kept, c]',
      'bar [1, 2]',
    ],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['kept'],
  },
  {
    name: 'broken ranges',
    lines: ['xychart', 'x-axis T aaa --> 33', 'y-axis 1 -->', 'y-axis 1 2', 'bar kept [1]'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['kept'],
  },
  {
    name: 'categories on the y axis and digits in an axis title',
    lines: ['xychart', 'y-axis T [1, 2]', 'x-axis Year2024 [a]', 'bar kept [1]'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['kept'],
  },
  {
    name: 'characters that need quotes',
    lines: ['xychart', 'title a(b)', 'x-axis [a<b, c]', 'bar n:m [1]', 'bar kept [2]'],
    errors: [
      ['UNEXPECTED_CHARACTER', 2],
      ['UNEXPECTED_CHARACTER', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['kept'],
  },
  {
    name: 'a second orientation, a late orientation and a late header',
    lines: ['xychart vertical horizontal', 'horizontal', 'bar kept [1]', 'xychart'],
    errors: [
      ['UNEXPECTED', 1],
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['kept'],
  },
  {
    name: 'statements split by `;`, two broken',
    lines: ['xychart', 'bar one [1]; line [; title; bar two [2]'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 2],
    ],
    keeps: ['one', 'two'],
  },
  {
    name: 'a glued comment takes the closing bracket',
    lines: ['xychart', 'bar a [1]%% c', 'bar kept [2]'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['kept'],
  },
  {
    name: 'an unclosed string runs to the end of the text',
    lines: ['xychart', 'bar kept [1]', 'title "open', 'line [2]'],
    errors: [['UNCLOSED_STRING', 3]],
    keeps: ['kept'],
  },
  {
    name: 'an unclosed point label',
    lines: ['xychart', 'bar kept [1]', 'line [1 "open, 2]', 'bar [3]'],
    errors: [['UNCLOSED_STRING', 3]],
    keeps: ['kept'],
  },
  {
    name: 'an unclosed string after a broken statement',
    lines: ['xychart', 'line kept [1]', 'x-axis : "open', 'bar [3]'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNCLOSED_STRING', 3],
    ],
    keeps: ['kept'],
  },
  {
    name: 'a backtick and a non-ASCII letter outside quotes',
    lines: ['xychart', 'title `md`', 'bar é [1]', 'bar kept [1]'],
    errors: [
      ['UNEXPECTED_CHARACTER', 2],
      ['UNEXPECTED_CHARACTER', 3],
    ],
    keeps: ['kept'],
  },
  {
    name: 'no plot at all',
    lines: ['xychart', 'title T', 'x-axis [a, b]'],
    errors: [['XYCHART_NO_PLOT', 1]],
  },
  {
    name: 'a failed plot is not also "no plot"',
    lines: ['xychart', 'bar [x]'],
    errors: [['UNEXPECTED', 2]],
  },
];

// Token names: jison terminals, v13 kind names that are compounds (`SquareBracesStart`, …), and
// the grammar's rule names; plain words such as `title` or `bar` are Mermaid syntax.
const RULES = ['alphaNumToken', 'alphaNum', 'dataPoints', 'parseXAxis', 'commaSeparatedTexts'];
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|-|^[A-Z]{2,}$/.test(n)),
  ...Object.keys(T).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

describe('xychart recovery set', () => {
  it.each(CASES)('$name', ({ lines, errors, keeps }) => {
    const src = lines.join('\n');
    const result = parseXyChart(src);
    const index = new LineIndex(src);
    const got = result.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d): [string, number] => [d.code, index.position(d.range.start).line + 1]);
    expect(got).toEqual(errors);
    for (const d of result.diagnostics) {
      expect(d.message).not.toMatch(BANNED);
      // A message quotes at most one line of the source.
      expect(d.message).not.toMatch(/[\n\r\u2028\u2029]/);
      for (const e of d.expected ?? []) expect(e).not.toMatch(BANNED);
    }
    const x = result.model.xAxis;
    const names = [
      ...result.model.plots.map((p) => p.name),
      ...(x.kind === 'band' ? x.categories : []),
    ];
    for (const k of keeps ?? []) expect(names).toContain(k);
  });

  it('has at least 20 errors over the set (R-PARSE-4)', () => {
    expect(CASES.reduce((n, c) => n + c.errors.length, 0)).toBeGreaterThanOrEqual(20);
  });

  it('a clean chart has no diagnostics', () => {
    const src =
      'xychart horizontal\n  title "Sales"\n  x-axis Month [jan, feb]\n  y-axis 0 --> 10\n  bar [1, 2]\n  line L [3 "p", 4]';
    expect(parseXyChart(src).diagnostics).toEqual([]);
  });
});
