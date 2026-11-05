import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseQuadrant } from '../index.ts';
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
  /** Point names and quadrant labels that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'labels missing after quadrant-1 and x-axis',
    lines: ['quadrantChart', 'quadrant-1', 'quadrant-2 two', 'x-axis', 'A: [0.1, 0.2]'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['two', 'A'],
  },
  {
    name: 'coordinates out of range and missing',
    lines: ['quadrantChart', 'A: [2, 0.5]', 'B: [0.5]', 'C: [0.5, 1.5]', 'D: [1, 0]'],
    errors: [
      ['UNEXPECTED_CHARACTER', 2],
      ['UNEXPECTED_CHARACTER', 3],
      ['UNEXPECTED_CHARACTER', 4],
    ],
    keeps: ['D'],
  },
  {
    name: 'two bad styles in one point, one in a classDef',
    lines: [
      'quadrantChart',
      'A: [0.1, 0.2] radius: f, color: red, stroke-width: 2px',
      'classDef c fill: #ff0000',
      'B:::c: [0.3, 0.4]',
    ],
    errors: [
      ['QUADRANT_STYLE_VALUE', 2],
      ['QUADRANT_STYLE_VALUE', 2],
      ['QUADRANT_STYLE_UNKNOWN', 3],
    ],
    keeps: ['A', 'B'],
  },
  {
    name: 'a bad style, then a syntax error in the same statement',
    lines: ['quadrantChart', 'A: [0.1, 0.2] radius: x, stroke-width: 1.5px', 'B: [0, 0]'],
    errors: [
      ['QUADRANT_STYLE_VALUE', 2],
      ['UNEXPECTED', 2],
    ],
    keeps: ['B'],
  },
  {
    name: 'classDef with two blanks, without styles, with `_`',
    lines: [
      'quadrantChart',
      'classDef  c radius: 3',
      'classDef d',
      'classDef a_b radius: 3',
      'quadrant-3 three',
    ],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['three'],
  },
  {
    name: 'a colon, brackets and a second arrow in text',
    lines: [
      'quadrantChart',
      'quadrant-1 Q: x',
      'quadrant-2 a(b)',
      'x-axis a --> b --> c',
      'quadrant-4 four',
    ],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED_CHARACTER', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['four'],
  },
  {
    name: 'a second header and an unknown quadrant',
    lines: ['quadrantChart', 'quadrantChart', 'quadrant-5 x', 'A: [0.5, 0.5]'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['A'],
  },
  {
    name: 'statements split by `;`, one broken',
    lines: ['quadrantChart', 'quadrant-1 one; quadrant-2; A: [0.5, 0.5]; x-axis -->'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 2],
    ],
    keeps: ['one', 'A'],
  },
  {
    name: 'no header, then a good statement',
    lines: ['quadrant-1 one', 'quadrant-2 two'],
    errors: [['UNEXPECTED', 1]],
    keeps: ['two'],
  },
  {
    name: 'an unclosed string runs to the end of the text',
    lines: ['quadrantChart', 'A: [0.5, 0.5]', 'quadrant-1 "open', 'quadrant-2 b'],
    errors: [['UNCLOSED_STRING', 3]],
    keeps: ['A'],
  },
  {
    name: 'an unclosed string after an axis label',
    lines: ['quadrantChart', 'A: [0.5, 0.5]', 'x-axis a "b', 'quadrant-1 c'],
    errors: [['UNCLOSED_STRING', 3]],
    keeps: ['A'],
  },
  {
    name: 'an unclosed string after a point name',
    lines: ['quadrantChart', 'A: [0.5, 0.5]', 'P "abc: [0.1,0.2]', 'Q: [0.3, 0.4]'],
    errors: [['UNCLOSED_STRING', 3]],
    keeps: ['A'],
  },
  {
    name: 'an unclosed markdown string after a quadrant label',
    lines: ['quadrantChart', 'quadrant-2 two', 'quadrant-1 a "`b', 'quadrant-3 c'],
    errors: [['UNCLOSED_STRING', 3]],
    keeps: ['two'],
  },
  {
    name: 'a quoted name, then an unclosed string',
    lines: ['quadrantChart', 'A: [0.5, 0.5]', 'P "abc" "d: [0.1,0.2]', 'Q: [0.3, 0.4]'],
    errors: [
      ['UNEXPECTED', 3],
      ['UNCLOSED_STRING', 3],
    ],
    keeps: ['A'],
  },
  {
    name: 'a quoted line break after a point name',
    lines: ['quadrantChart', 'P "a', 'b": [0.1, 0.2]', 'Q: [0.3, 0.4]'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['Q'],
  },
  {
    name: 'text before the header',
    lines: ['foo', 'bar baz', 'quadrantChart', 'P: [0.1, 0.2]', 'quadrant-1 one'],
    errors: [['UNEXPECTED', 1]],
    keeps: ['P', 'one'],
  },
  {
    name: 'an unclosed description',
    lines: ['quadrantChart', 'quadrant-1 one', 'accDescr {', '  open'],
    errors: [['UNCLOSED_DESCRIPTION', 3]],
    keeps: ['one'],
  },
];

// Token names: jison terminals, v13 kind names that are compounds (`PointStart`, …), and the
// grammar's rule names; plain words such as `title` or `classDef` are Mermaid syntax.
const RULES = ['textNoTagsToken', 'alphaNumToken', 'idString', 'stylesOpt', 'styleComponent'];
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|-|^[A-Z]{2,}$/.test(n)),
  ...Object.keys(T).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

describe('quadrant recovery set', () => {
  it.each(CASES)('$name', ({ lines, errors, keeps }) => {
    const src = lines.join('\n');
    const result = parseQuadrant(src);
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
    const names = [
      ...result.model.points.map((p) => p.label.text),
      ...result.model.quadrants.map((q) => q?.text),
    ];
    for (const k of keeps ?? []) expect(names).toContain(k);
  });

  it('has at least 20 errors over the set (R-PARSE-4)', () => {
    expect(CASES.reduce((n, c) => n + c.errors.length, 0)).toBeGreaterThanOrEqual(20);
  });

  it('a clean chart has no diagnostics', () => {
    const src = 'quadrantChart\n  title T\n  x-axis L --> R\n  quadrant-1 Q\n  A:::c: [0.1, 0.2]';
    expect(parseQuadrant(src).diagnostics).toEqual([]);
  });
});
