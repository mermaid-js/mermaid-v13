import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseVenn } from '@mermaid-js/diagram-venn';
import { loadOracle } from '../oracle.ts';
import type { CorpusItem } from '../types.ts';
import { INTERNAL_NAMES, vennCases, withoutQuotes } from './corpus.ts';

/**
 * Recovery set (R-PARSE-4, #488): the `venn-cases/recovery-…` sources of
 * `corpus/venn-cases.json` each plant N independent errors and list them as
 * `errors: [code, 1-based line][]`. The parser gives exactly those N error diagnostics, the
 * sets and overlaps in `keeps` (ids joined with `+`) still reach the model, mermaid\@12 rejects
 * every one of them (it stops at the first), no message names a token or a grammar rule
 * (R-ERR-5), and where a case lists `warnings` the parse gives exactly those.
 *
 * A syntax error resyncs at the next statement keyword or line break, so each bad statement
 * gives one diagnostic, also several on one line; v12's two DB checks on `union` do not stop the
 * statement, so they add to it.
 */
interface RecoveryCase extends CorpusItem {
  errors: [code: string, line: number][];
  keeps: string[];
  /** The warning codes, when the case says what happens around an error (optional). */
  warnings?: string[];
}

const CASES = vennCases().filter((c): c is RecoveryCase => c.id.startsWith('venn-cases/recovery-'));

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
      for (const d of diagnostics) expect(withoutQuotes(d.message)).not.toMatch(INTERNAL_NAMES);
      if (c.warnings) expect(model.warnings.map((d) => d.code)).toEqual(c.warnings);
      const v12 = await (await loadOracle()).parse(c.source);
      expect(v12.accepted).toBe(false);
    });
  }
});
