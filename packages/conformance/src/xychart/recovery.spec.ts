import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { JISON_NAMES, parseXyChart, XyChartTokenKind } from '@mermaid-js/diagram-xychart';
import { xyChartRecovery } from './corpus.ts';

/**
 * Recovery set (R-PARSE-4): charts with N independent errors give N error diagnostics, each on
 * the line where the error was planted, and the statements around them still reach the model.
 * No message names a token or a grammar rule, or quotes more than one line (R-ERR-5). The cases
 * are `corpus/xychart-recovery.json`, which the XY chart gates also run (lexer, grammar and
 * model parity with v12, which rejects every one of them).
 */
// Token names: jison terminals, v13 kind names that are compounds (`SquareBracesStart`, …), and
// the grammar's rule names; plain words such as `title` or `bar` are Mermaid syntax.
const RULES = ['alphaNumToken', 'alphaNum', 'dataPoints', 'parseXAxis', 'commaSeparatedTexts'];
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|-|^[A-Z]{2,}$/.test(n)),
  ...Object.keys(XyChartTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

const CASES = xyChartRecovery();

describe('xychart recovery set (R-PARSE-4)', () => {
  it('has at least 20 cases and 20 errors, at least 10 cases with several errors', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.reduce((n, c) => n + c.errors.length, 0)).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.length > 1).length).toBeGreaterThanOrEqual(10);
  });

  it.each(CASES)('$name', ({ source, errors, keeps }) => {
    const result = parseXyChart(source);
    const index = new LineIndex(source);
    const got = result.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d): [string, number] => [d.code, index.position(d.range.start).line + 1]);
    expect(got).toEqual(errors);
    for (const d of result.diagnostics) {
      expect(d.message).not.toMatch(BANNED);
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

  it('a clean chart has no diagnostics', () => {
    const src =
      'xychart horizontal\n  title "Sales"\n  x-axis Month [jan, feb]\n  y-axis 0 --> 10\n  bar [1, 2]\n  line L [3 "p", 4]';
    expect(parseXyChart(src).diagnostics).toEqual([]);
  });
});
