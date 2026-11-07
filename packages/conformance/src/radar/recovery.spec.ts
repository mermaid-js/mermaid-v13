import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseRadar } from '@mermaid-js/diagram-radar';
import { LANGIUM_NAMES } from '@mermaid-js/diagram-radar/testing';
import { REPO_ROOT } from '../corpus.ts';

/**
 * Recovery set (R-PARSE-4): documents with N independent errors give N error diagnostics, each
 * on the line where the error was planted, and the axes and curves around them still reach the
 * model. No message names a token or a grammar rule (R-ERR-5). The cases are
 * `corpus/radar-recovery.json`, which the radar gates also run (lexer and model parity with
 * v12).
 */
interface Case {
  id: string;
  name: string;
  source: string;
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Axis and curve names that must still be in the model. */
  keeps?: string[];
}

const CASES = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/radar-recovery.json'), 'utf8')
) as Case[];

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
  it('has at least 20 cases, at least 10 with several independent errors', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.length > 1).length).toBeGreaterThanOrEqual(10);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const src = c.source;
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
