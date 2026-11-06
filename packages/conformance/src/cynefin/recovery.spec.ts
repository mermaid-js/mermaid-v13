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
 */
interface RecoveryCase extends CorpusItem {
  errors: [code: string, line: number][];
  keeps: string[];
}

const CASES = cynefinCases().filter((c): c is RecoveryCase =>
  c.id.startsWith('cynefin-cases/recovery-')
);

/** Token type names (`DOMAIN_NAME`, …) and grammar rule names, which no message may name. */
const INTERNAL = [
  ...Object.values(LANGIUM_NAMES).filter((n) => /^[A-Z_]{3,}$/.test(n)),
  'DomainBlock',
  'DomainItem',
  'TitleAndAccessibilities',
  'EOL',
];

describe('cynefin recovery (R-PARSE-4)', () => {
  it('has at least 20 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
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
      expect((await (await loadOracle()).parse(c.source)).accepted).toBe(false);
    });
  }
});
