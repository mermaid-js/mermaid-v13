import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { JISON_NAMES, parseVenn, VennTokenKind } from '@mermaid-js/diagram-venn';
import { loadOracle } from '../oracle.ts';
import type { CorpusItem } from '../types.ts';
import { vennCases } from './corpus.ts';

/**
 * Recovery set (R-PARSE-4, #488): the `venn-cases/recovery-…` sources of
 * `corpus/venn-cases.json` each plant N independent errors and list them as
 * `errors: [code, 1-based line][]`. The parser gives exactly those N error diagnostics, the
 * sets and overlaps in `keeps` (ids joined with `+`) still reach the model, mermaid\@12 rejects
 * every one of them (it stops at the first), and no message names a token or a grammar rule
 * (R-ERR-5).
 *
 * A syntax error resyncs at the line end, so a line gives one syntax diagnostic; v12's two DB
 * checks on `union` do not stop the statement, so they add to it.
 */
interface RecoveryCase extends CorpusItem {
  errors: [code: string, line: number][];
  keeps: string[];
}

const CASES = vennCases().filter((c): c is RecoveryCase => c.id.startsWith('venn-cases/recovery-'));

/** Jison terminal and v13 kind names, and v12's and the grammar file's rule names. */
const INTERNAL = [
  ...Object.values(JISON_NAMES).filter((n) => /^[A-Z_]{3,}$/.test(n)),
  ...Object.keys(VennTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
  'optNewlines',
  'identifierList',
  'indentedTextTail',
  'stylesOpt',
  'styleField',
  'styleValue',
  'valueTokens',
  'valueToken',
  'IndentedText',
  'textId',
];

describe('venn recovery (R-PARSE-4)', () => {
  it('has at least 20 cases, several with more than one error', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.length >= 2).length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...CASES.map((c) => c.errors.length))).toBeGreaterThanOrEqual(5);
    // Two errors on one line: a DB check, then a syntax error or another check.
    const onOneLine = (c: RecoveryCase) =>
      c.errors.some(([, line], i) => c.errors.findIndex(([, l]) => l === line) !== i);
    expect(CASES.filter(onOneLine).length).toBeGreaterThanOrEqual(2);
  });

  for (const c of CASES) {
    it(c.id, async () => {
      const { model, diagnostics } = parseVenn(c.source);
      const lines = new LineIndex(c.source);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const kept = model.subsets.map((s) => s.sets.join('+'));
      for (const k of c.keeps) expect(kept).toContain(k);
      for (const d of diagnostics) {
        for (const name of INTERNAL)
          expect(d.message, d.message).not.toMatch(new RegExp(`\\b${name}\\b`));
      }
      const v12 = await (await loadOracle()).parse(c.source);
      expect(v12.accepted).toBe(false);
    });
  }
});
