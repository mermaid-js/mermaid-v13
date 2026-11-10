import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseIshikawa } from '@mermaid-js/diagram-ishikawa';
import type { IshikawaCause } from '@mermaid-js/diagram-ishikawa';
import { loadOracle } from '../oracle.ts';
import type { CorpusItem } from '../types.ts';
import { INTERNAL_NAMES, ishikawaCases, withoutQuotes } from './corpus.ts';

/**
 * Recovery set (R-PARSE-4, #581): the `ishikawa-cases/recovery-…` sources of
 * `corpus/ishikawa-cases.json` each plant N independent errors and list them as
 * `errors: [code, 1-based line][]`. The parser gives exactly those N error diagnostics, the
 * causes in `keeps` still reach the model, mermaid\@12 rejects every one of them (it stops at
 * the first), and no message names a token or a grammar rule (R-ERR-5).
 *
 * An error skips the rest of its line; a line that only came one blank or comment line too
 * early or late is reported and still read, so each bad line gives one diagnostic.
 */
interface RecoveryCase extends CorpusItem {
  errors: [code: string, line: number][];
  keeps: string[];
}

const CASES = ishikawaCases().filter((c): c is RecoveryCase =>
  c.id.startsWith('ishikawa-cases/recovery-')
);

const texts = (causes: readonly IshikawaCause[], out: string[] = []): string[] => {
  for (const c of causes) {
    out.push(c.text);
    texts(c.causes, out);
  }
  return out;
};

describe('ishikawa recovery (R-PARSE-4)', () => {
  it('has at least 20 cases, several with more than one error', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.length >= 2).length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...CASES.map((c) => c.errors.length))).toBeGreaterThanOrEqual(5);
  });

  for (const c of CASES) {
    it(c.id, async () => {
      const { model, diagnostics } = parseIshikawa(c.source);
      const lines = new LineIndex(c.source);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const kept = texts(model.causes);
      for (const k of c.keeps) expect(kept).toContain(k);
      for (const d of diagnostics) expect(withoutQuotes(d.message)).not.toMatch(INTERNAL_NAMES);
      const v12 = await (await loadOracle()).parse(c.source);
      expect(v12.accepted).toBe(false);
    });
  }
});
