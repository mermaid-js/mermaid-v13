import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseRailroad } from '@mermaid-js/diagram-railroad';
import { LANGIUM_NAMES } from '@mermaid-js/diagram-railroad/testing';
import { REPO_ROOT } from '../corpus.ts';

/**
 * Recovery set (R-PARSE-4): documents with N independent errors give N error diagnostics, each
 * on the line where the error was planted, and the rules around them still reach the model. No
 * message names a token or a grammar rule (R-ERR-5). The cases are
 * `corpus/railroad-recovery.json`, at least 20 per notation, which the railroad gates also run
 * (lexer and model parity with v12, which rejects every one of them).
 */
interface Case {
  id: string;
  name: string;
  source: string;
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Rule names that must still be in the model. */
  keeps: string[];
}

const CASES = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/railroad-recovery.json'), 'utf8')
) as Case[];

/** Chevrotain token type names (`RR_ID`, `EBNF_STRING`, …) and v12's grammar rule names. */
const INTERNAL = [
  ...new Set(
    Object.values(LANGIUM_NAMES).flatMap((names) =>
      Object.values(names).filter((n) => /^[A-Z_]{3,}$/.test(n))
    )
  ),
  'RailroadExpression',
  'RailroadRule',
  'EbnfChoice',
  'EbnfSequence',
  'EbnfTerm',
  'EbnfPrimary',
  'EbnfPostfix',
  'AbnfAlternation',
  'AbnfConcatenation',
  'AbnfElement',
  'AbnfPrimary',
  'PegOrderedChoice',
  'PegSequence',
  'PegPrefix',
  'PegSuffix',
  'PegPrimary',
];

describe('railroad recovery (R-PARSE-4)', () => {
  it('has at least 20 cases per notation, several with more than one error', () => {
    for (const n of ['ir', 'ebnf', 'abnf', 'peg']) {
      const mine = CASES.filter((c) => c.id.startsWith(`railroad-recovery/${n}-`));
      expect(mine.length, n).toBeGreaterThanOrEqual(20);
      expect(mine.filter((c) => c.errors.length > 1).length, n).toBeGreaterThanOrEqual(4);
    }
  });

  for (const c of CASES) {
    it(c.name, () => {
      const src = c.source;
      const { model, diagnostics } = parseRailroad(src);
      const lines = new LineIndex(src);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const names = model.rules.map((r) => r.name);
      for (const k of c.keeps) expect(names).toContain(k);
      for (const d of diagnostics) {
        for (const name of INTERNAL) expect(d.message, d.message).not.toContain(name);
      }
    });
  }
});
