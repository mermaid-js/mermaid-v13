import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseRadar } from './parser.ts';
import { LANGIUM_NAMES } from './tokens.ts';

/**
 * Recovery set (R-PARSE-4): documents with N independent errors give N error diagnostics, each
 * on the line where the error was planted, and the axes and curves around them still reach the
 * model. No message names a token or a grammar rule (R-ERR-5).
 */
interface Case {
  name: string;
  lines: string[];
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Axis and curve names that must still be in the model. */
  keeps?: string[];
}

const CASES: Case[] = [
  {
    name: 'a list broken after its comma',
    lines: ['radar-beta', 'axis A,', 'B', 'axis C'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['A', 'C'],
  },
  {
    name: 'two axis names without a comma',
    lines: ['radar-beta', 'axis A B', 'axis C'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['A', 'C'],
  },
  {
    name: 'an axis label without quotes',
    lines: ['radar-beta', 'axis A[x]', 'axis C'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['C'],
  },
  {
    name: 'an unclosed label',
    lines: ['radar-beta', 'axis C', 'axis A["x]'],
    errors: [['UNCLOSED_STRING', 3]],
    keeps: ['C'],
  },
  {
    name: 'a curve without values',
    lines: ['radar-beta', 'axis A', 'curve c', 'curve d{1}'],
    errors: [['UNEXPECTED', 3]],
    keeps: ['A', 'd'],
  },
  {
    name: 'a curve whose `{` is on the next line',
    lines: ['radar-beta', 'axis A', 'curve c', '{1}', 'curve d{1}'],
    errors: [['UNEXPECTED', 3]],
    keeps: ['d'],
  },
  {
    name: 'empty braces',
    lines: ['radar-beta', 'axis A', 'curve c{}', 'curve d{1}'],
    errors: [['UNEXPECTED', 3]],
    keeps: ['d'],
  },
  {
    name: 'values without a comma, over lines',
    lines: ['radar-beta', 'axis A, B', 'curve c{', '1', '2', '}', 'curve d{1, 2}'],
    errors: [['UNEXPECTED', 5]],
    keeps: ['A', 'B', 'd'],
  },
  {
    name: 'a line break before a comma',
    lines: ['radar-beta', 'axis A, B', 'curve c{1', ', 2}', 'curve d{1, 2}'],
    errors: [['UNEXPECTED', 4]],
    keeps: ['d'],
  },
  {
    name: 'mixed positional and detailed values',
    lines: ['radar-beta', 'axis A, B', 'curve c{1, A 2}', 'curve d{1, 2}'],
    errors: [['UNEXPECTED', 3]],
    keeps: ['d'],
  },
  {
    name: 'an unclosed curve before the next statement',
    lines: ['radar-beta', 'axis A, B', 'curve c{1, 2', 'axis C', 'curve d{1, 2, 3}'],
    errors: [['UNEXPECTED', 4]],
    keeps: ['C', 'd'],
  },
  {
    name: 'a negative value',
    lines: ['radar-beta', 'axis A', 'curve c{-1}', 'curve d{1}'],
    errors: [['UNEXPECTED_CHARACTER', 3]],
    keeps: ['d'],
  },
  {
    name: 'a value with a leading zero',
    lines: ['radar-beta', 'axis A', 'curve c{01}', 'curve d{1}'],
    errors: [['UNEXPECTED', 3]],
    keeps: ['d'],
  },
  {
    name: 'a value ending in a dot',
    lines: ['radar-beta', 'axis A', 'curve c{1.}', 'curve d{1}'],
    errors: [['UNEXPECTED_CHARACTER', 3]],
    keeps: ['d'],
  },
  {
    name: 'a name starting with a keyword',
    lines: ['radar-beta', 'axis circles', 'axis A'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['A'],
  },
  {
    name: 'a non-ASCII name',
    lines: ['radar-beta', 'axis über', 'axis A'],
    errors: [['UNEXPECTED_CHARACTER', 2]],
    keeps: ['A'],
  },
  {
    name: 'an option without its value',
    lines: ['radar-beta', 'ticks', 'axis A'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['A'],
  },
  {
    name: 'a bad option value',
    lines: ['radar-beta', 'graticule square', 'showLegend yes', 'axis A'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
    ],
    keeps: ['A'],
  },
  {
    name: 'a statement after a title on its line',
    lines: ['radar-beta', 'axis A', 'accTitle: x', 'title t axis B'],
    errors: [],
    keeps: ['A'],
  },
  {
    name: 'accTitle without a colon',
    lines: ['radar-beta', 'accTitle x', 'axis A'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['A'],
  },
  {
    name: 'an unclosed accDescr block',
    lines: ['radar-beta', 'accDescr { x', 'axis A'],
    errors: [['UNCLOSED_ACC_DESCR', 2]],
    keeps: ['A'],
  },
  {
    name: 'a semicolon after a statement',
    lines: ['radar-beta', 'axis A;', 'axis B'],
    errors: [['UNEXPECTED_CHARACTER', 2]],
    keeps: ['A', 'B'],
  },
  {
    name: 'a stray character',
    lines: ['radar-beta', 'axis A', '@', 'axis B'],
    errors: [['UNEXPECTED_CHARACTER', 3]],
    keeps: ['A', 'B'],
  },
  {
    name: 'no radar-beta at the start',
    lines: ['axis A', 'axis B'],
    errors: [['UNEXPECTED', 1]],
    keeps: ['B'],
  },
  {
    name: 'a second radar-beta',
    lines: ['radar-beta', 'radar-beta', 'axis A'],
    errors: [['UNEXPECTED', 2]],
    keeps: ['A'],
  },
  {
    name: 'a missing entry for an axis',
    lines: ['radar-beta', 'axis A, B', 'curve c{A: 1}', 'curve d{1, 2}'],
    errors: [['RADAR_MISSING_ENTRY', 3]],
    keeps: ['c', 'd'],
  },
  {
    name: 'detailed entries and no axes',
    lines: ['radar-beta', 'curve c{A: 1}', 'curve d{1}'],
    errors: [['RADAR_NO_AXES', 2]],
    keeps: ['c', 'd'],
  },
  {
    name: 'a missing entry, then a syntax error after it',
    lines: ['radar-beta', 'axis A, B', 'curve c{A: 1}', 'curve d{1 2}'],
    errors: [
      ['RADAR_MISSING_ENTRY', 3],
      ['UNEXPECTED', 4],
    ],
    keeps: ['c'],
  },
  {
    name: 'five bad statements among good ones',
    lines: ['radar-beta', 'axis A,', 'axis B C', 'curve c{1 2}', 'curve d{A}', 'ticks x', 'axis D'],
    errors: [
      ['UNEXPECTED', 2],
      ['UNEXPECTED', 3],
      ['UNEXPECTED', 4],
      ['UNEXPECTED', 5],
      ['UNEXPECTED', 6],
    ],
    keeps: ['A', 'B', 'D'],
  },
];

/** Token type names (`NUMBER`, `GRATICULE`, …) and grammar rule names, which no message may name. */
const INTERNAL = [
  ...Object.values(LANGIUM_NAMES).filter((n) => /^[A-Z_]{3,}$/.test(n)),
  'TitleAndAccessibilities',
  'DetailedEntry',
  'NumberEntry',
  'Entries',
  'EOL',
];

describe('radar recovery (R-PARSE-4)', () => {
  it('has at least 20 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const src = c.lines.join('\n');
      const { model, diagnostics } = parseRadar(src);
      const lines = new LineIndex(src);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const names = [...model.axes, ...model.curves].map((s) => s.name);
      for (const k of c.keeps ?? []) expect(names).toContain(k);
      for (const d of diagnostics) {
        for (const name of INTERNAL) expect(d.message, d.message).not.toContain(name);
      }
    });
  }
});
