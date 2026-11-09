import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { MODEL_CODES, parseUsecase } from '@mermaid-js/diagram-usecase';
import { usecaseCases } from './corpus.ts';
import { INTERNAL_NAMES, withoutQuotes } from './internal-names.ts';

/**
 * Recovery set (R-PARSE-4, D473): documents with N independent errors give N error
 * diagnostics, each on the line where the error was planted, and the elements around them still
 * reach the model. The set has syntax errors in and around boundaries and multi-line metadata,
 * and the model builder's errors (v12 threw only its first). No message names a token or a
 * grammar rule (R-ERR-5). The cases are the `usecase-cases/recovery/*` entries of
 * `corpus/usecase-cases.json`, which the usecase gates also run (lexer and model parity, and
 * the first error's offset, with v12).
 */
interface Case {
  id: string;
  name: string;
  source: string;
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Actor and use case ids that must still be in the model. */
  keeps: string[];
}

const CASES = usecaseCases().filter((c) => c.id.startsWith('usecase-cases/recovery/')) as Case[];

describe('usecase recovery (R-PARSE-4)', () => {
  it('has at least 20 cases, at least 20 with several errors, model errors among them', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.length > 1).length).toBeGreaterThanOrEqual(20);
    const model = CASES.filter((c) => c.errors.some(([code]) => MODEL_CODES.has(code)));
    expect(model.length).toBeGreaterThanOrEqual(10);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const src = c.source;
      const { model, diagnostics } = parseUsecase(src);
      const lines = new LineIndex(src);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const ids = [...model.actors, ...model.useCases].map((e) => e.id);
      for (const k of c.keeps) expect(ids).toContain(k);
      for (const d of diagnostics) {
        expect(INTERNAL_NAMES.test(withoutQuotes(d.message)), d.message).toBe(false);
      }
    });
  }
});
