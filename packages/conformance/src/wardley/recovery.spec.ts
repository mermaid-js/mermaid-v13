import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseWardley } from '@mermaid-js/diagram-wardley';
import { LANGIUM_NAMES } from '@mermaid-js/diagram-wardley/testing';
import { REPO_ROOT } from '../corpus.ts';

/**
 * Recovery set (R-PARSE-4): documents with N independent errors give N error diagnostics, each
 * on the line where the error was planted, and the nodes around them still reach the model.
 * The set has v12's thrown range errors in every context, and syntax errors in and around
 * pipelines. No message names a token or a grammar rule (R-ERR-5). The cases are
 * `corpus/wardley-recovery.json`, which the wardley gates also run (lexer and model parity with
 * v12).
 */
interface Case {
  id: string;
  name: string;
  source: string;
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Node ids that must still be in the model. */
  keeps?: string[];
}

const CASES = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/wardley-recovery.json'), 'utf8')
) as Case[];

/** Token type names (`NAME_WITH_SPACES`, `KW_NOTE`, …) and v12's grammar rule names. */
const INTERNAL = [
  ...Object.values(LANGIUM_NAMES).filter((n) => /^[A-Z_]{3,}$/.test(n)),
  'TitleAndAccessibilities',
  'EvolutionStage',
  'PipelineComponent',
  'CoordinateValue',
  'Decorator',
  'Statement',
  'EOL',
];

describe('wardley recovery (R-PARSE-4)', () => {
  it('has at least 20 cases, at least 10 with several errors, range errors among them', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.length > 1).length).toBeGreaterThanOrEqual(10);
    const range = CASES.filter((c) => c.errors.some(([code]) => code === 'WARDLEY_OUT_OF_RANGE'));
    expect(range.length).toBeGreaterThanOrEqual(5);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const src = c.source;
      const { model, diagnostics } = parseWardley(src);
      const lines = new LineIndex(src);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const ids = model.nodes.map((n) => n.id);
      for (const k of c.keeps ?? []) expect(ids).toContain(k);
      for (const d of diagnostics) {
        for (const name of INTERNAL) expect(d.message, d.message).not.toContain(name);
      }
    });
  }
});
