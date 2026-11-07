import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseCynefin } from '@mermaid-js/diagram-cynefin';
import { LANGIUM_NAMES } from '@mermaid-js/diagram-cynefin/testing';
import { loadOracle } from '../oracle.ts';
import type { CorpusItem } from '../types.ts';
import { cynefinCases } from './corpus.ts';

/**
 * Recovery set (R-PARSE-4, #465): the `cynefin-cases/recovery-…` sources of
 * `corpus/cynefin-cases.json` each plant N independent errors and list them as
 * `errors: [code, 1-based line][]`. The parser gives exactly those N error diagnostics, the
 * items in `keeps` still reach the model, mermaid\@12 rejects every one of them, and no message
 * names a token or a grammar rule (R-ERR-5).
 *
 * Every lexer error is reported, also one inside the rest of a line that recovery skips (US2
 * "with every error reported"): the diagnostics made from text no token matches
 * ({@link LEXER_CODES}) are as many as the `Lexer error` lines of mermaid\@12's message. Parse
 * errors resync at the line end, so only the first of a line is reported (v12 lists each).
 */
interface RecoveryCase extends CorpusItem {
  errors: [code: string, line: number][];
  keeps: string[];
}

/** The codes of diagnostics made from a lexer error (text no token rule matches). */
const LEXER_CODES = new Set(['UNEXPECTED_CHARACTER', 'UNCLOSED_STRING', 'UNCLOSED_ACC_DESCR']);

const CASES = cynefinCases().filter((c): c is RecoveryCase =>
  c.id.startsWith('cynefin-cases/recovery-')
);

/** Token type names (`DOMAIN_NAME`, …) and grammar rule names, which no message may name. */
const INTERNAL = [
  ...Object.values(LANGIUM_NAMES).filter((n) => /^[A-Z_]{3,}$/.test(n)),
  // v12's `cynefin.langium` / `common.langium` rules and `grammar/cynefin.ebnf`'s.
  'Cynefin',
  'DomainBlock',
  'DomainItem',
  'Transition',
  'TitleAndAccessibilities',
  'EOL',
  'Header',
  'Domain',
  'Item',
  'AccTitle',
  'AccDescr',
];

describe('cynefin recovery (R-PARSE-4)', () => {
  it('has at least 20 cases, several with more than one error', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.length >= 2).length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...CASES.map((c) => c.errors.length))).toBeGreaterThanOrEqual(5);
    // Two or more errors on one line.
    const onOneLine = (c: RecoveryCase) =>
      c.errors.some(([, line], i) => c.errors.findIndex(([, l]) => l === line) !== i);
    expect(CASES.filter(onOneLine).length).toBeGreaterThanOrEqual(5);
  });

  for (const c of CASES) {
    it(c.id, async () => {
      const { model, diagnostics } = parseCynefin(c.source);
      const lines = new LineIndex(c.source);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const labels = model.domains.flatMap((d) => d.items.map((i) => i.label));
      for (const k of c.keeps) expect(labels).toContain(k);
      for (const d of diagnostics) {
        for (const name of INTERNAL) expect(d.message, d.message).not.toContain(name);
      }
      const v12 = await (await loadOracle()).parse(c.source);
      expect(v12.accepted).toBe(false);
      const v12LexerErrors = v12.accepted ? 0 : v12.error.split('Lexer error').length - 1;
      expect(errors.filter(([code]) => LEXER_CODES.has(code as string)).length).toBe(
        v12LexerErrors
      );
    });
  }
});
