import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseArchitecture } from '@mermaid-js/diagram-architecture';
import { LANGIUM_NAMES } from '@mermaid-js/diagram-architecture/testing';
import { REPO_ROOT } from '../corpus.ts';

/**
 * Recovery set (R-PARSE-4, #599): documents with N independent errors give N error diagnostics,
 * each on the line where the error was planted, and the services around them still reach the
 * model. The set has every kind of v12's DB errors (D504's group-id edge end among them) and
 * syntax errors, mixed. No message names a token or a grammar rule (R-ERR-5). The cases are
 * `corpus/architecture-recovery.json`, which the architecture gates also run (lexer and model
 * parity with v12).
 */
interface Case {
  id: string;
  name: string;
  source: string;
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** `[code, 1-based line]` of every expected warning, in order. */
  warnings?: [string, number][];
  /** Service ids that must still be in the model. */
  keeps?: string[];
}

const CASES = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/architecture-recovery.json'), 'utf8')
) as Case[];

/** Token type names (`ARCH_TITLE`, `ARROW_DIRECTION`, …) and v12's grammar rule names. */
const INTERNAL = [
  ...Object.values(LANGIUM_NAMES).filter((n) => /^[A-Z_]{3,}$/.test(n)),
  'TitleAndAccessibilities',
  'LeftPort',
  'RightPort',
  'Alignment',
  'Statement',
  'EOL',
];

describe('architecture recovery (R-PARSE-4)', () => {
  it('has at least 20 cases, at least 10 with several errors, DB errors among them', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.length > 1).length).toBeGreaterThanOrEqual(10);
    const db = CASES.filter((c) => c.errors.some(([code]) => code.startsWith('ARCHITECTURE_')));
    expect(db.length).toBeGreaterThanOrEqual(10);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const src = c.source;
      const { model, diagnostics } = parseArchitecture(src);
      const lines = new LineIndex(src);
      const at = (severity: string) =>
        diagnostics
          .filter((d) => d.severity === severity)
          .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(at('error')).toEqual(c.errors);
      expect(at('warning')).toEqual(c.warnings ?? []);
      const ids = model.services.map((s) => s.id);
      for (const k of c.keeps ?? []) expect(ids).toContain(k);
      for (const d of diagnostics) {
        for (const name of INTERNAL) expect(d.message, d.message).not.toContain(name);
      }
    });
  }
});
