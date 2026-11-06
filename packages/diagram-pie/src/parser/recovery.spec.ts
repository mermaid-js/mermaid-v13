import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parsePie } from './parser.ts';
import { LANGIUM_NAMES } from './tokens.ts';

/**
 * Recovery set (R-PARSE-4): documents with N independent errors give N error diagnostics, each
 * on the line where the error was planted, and the sections around them still reach the model.
 * No message names a token or a grammar rule (R-ERR-5).
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Section labels that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'a section without its colon',
    lines: ['pie', '"a" 1', '"b": 2'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'a section without its value',
    lines: ['pie', '"a":', '"b": 2'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'two sections on one line',
    lines: ['pie', '"a": 1 "b": 2', '"c": 3'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['a', 'c'],
  },
  {
    name: 'a semicolon after a value',
    lines: ['pie', '"a": 1;', '"b": 2'],
    errors: [['UNEXPECTED_CHARACTER', 2]],
    keeps: ['b'],
  },
  {
    name: 'a value ending in a dot',
    lines: ['pie', '"a": 12.', '"b": 2'],
    errors: [['UNEXPECTED_CHARACTER', 2]],
    keeps: ['b'],
  },
  {
    name: 'a value with a leading zero',
    lines: ['pie', '"a": 01', '"b": 2'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'a value with an exponent',
    lines: ['pie', '"a": 1e3', '"b": 2'],
    errors: [['UNEXPECTED_CHARACTER', 2]],
    keeps: ['b'],
  },
  {
    name: 'an unclosed label',
    lines: ['pie', '"b": 2', "'a: 1"],
    errors: [['UNCLOSED_STRING', 3]],
    keeps: ['b'],
  },
  {
    name: 'accTitle without a colon',
    lines: ['pie', 'accTitle x', '"b": 2'],
    errors: [['UNEXPECTED_CHARACTER', 2]],
    keeps: ['b'],
  },
  {
    name: 'an unclosed accDescr block',
    lines: ['pie', 'accDescr { x', '"b": 2'],
    errors: [['UNCLOSED_ACC_DESCR', 2]],
    keeps: ['b'],
  },
  {
    name: 'showData on a line of its own',
    lines: ['pie', 'showData', '"a": 1'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['a'],
  },
  {
    name: 'a second pie',
    lines: ['pie', 'pie', '"a": 1'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['a'],
  },
  {
    name: 'a stray character',
    lines: ['pie', '"a": 1', '@', '"b": 2'],
    errors: [['UNEXPECTED_CHARACTER', 3]],
    keeps: ['a', 'b'],
  },
  {
    name: 'a negative value',
    lines: ['pie', '"a": -1', '"b": 2'],
    errors: [['PIE_NEGATIVE_VALUE', 2]],
    keeps: ['b'],
  },
  {
    name: 'a negative value, then a syntax error in the same statement',
    lines: ['pie', '"a": -1 x', '"b": 2'],
    errors: [
      ['PIE_NEGATIVE_VALUE', 2],
      ['UNEXPECTED_CHARACTER', 2],
    ],
    keeps: ['b'],
  },
  {
    name: 'a section after accDescr on its line',
    lines: ['pie', 'accDescr {x} "a": 1', '"b": 2'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'a value without a label',
    lines: ['pie', ': 1', '"b": 2'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'a number alone',
    lines: ['pie', '42', '"b": 2'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['b'],
  },
  {
    name: 'no pie at the start',
    lines: ['"a": 1', '"b": 2'],
    errors: [['UNEXPECTED', 1]],
    keeps: ['b'],
  },
  {
    name: 'a quoted value',
    lines: ['pie', '"a": "b"', '"c": 1'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['c'],
  },
  {
    name: 'three bad sections among good ones',
    lines: ['pie', '"a" 1', '"b": 2;', '"c": x', '"d": 4'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED_CHARACTER', 3],
      ['UNEXPECTED_CHARACTER', 4],
    ],
    keeps: ['b', 'd'],
  },
  {
    name: 'an upper-case PIE',
    lines: ['PIE', '"a": 1'],
    errors: [['UNEXPECTED_CHARACTER', 1]],
    keeps: ['a'],
  },
  {
    name: 'a title glued to its text',
    lines: ['pie', 'titlex', '"a": 1', '"b" : 2 title y'],
    errors: [
      ['UNEXPECTED_CHARACTER', 2],
      ['UNEXPECTED', 4],
    ],
    keeps: ['a', 'b'],
  },
];

/** Token type names (`NUMBER_PIE`, …) and grammar rule names, which no message may name. */
const INTERNAL = [
  ...Object.values(LANGIUM_NAMES).filter((n) => /^[A-Z_]{3,}$/.test(n)),
  'PieSection',
  'TitleAndAccessibilities',
  'EOL',
];

describe('pie recovery (R-PARSE-4)', () => {
  it('has at least 20 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const src = c.lines.join('\n');
      const { model, diagnostics } = parsePie(src);
      const lines = new LineIndex(src);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const labels = model.sections.map((s) => s.label);
      for (const k of c.keeps ?? []) expect(labels).toContain(k);
      for (const d of diagnostics) {
        for (const name of INTERNAL) expect(d.message, d.message).not.toContain(name);
      }
    });
  }
});
