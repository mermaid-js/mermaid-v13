import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseTreemap } from '@mermaid-js/diagram-treemap';
import type { TreemapNode } from '@mermaid-js/diagram-treemap';
import { LANGIUM_NAMES } from '@mermaid-js/diagram-treemap/testing';
import { REPO_ROOT } from '../corpus.ts';

/**
 * Recovery set (R-PARSE-4, #484): documents with N independent errors give N error diagnostics,
 * each on the line where the error was planted, and the rows around them still reach the model.
 * No message names a token or a grammar rule (R-ERR-5). The cases are
 * `corpus/treemap-recovery.json`, which the treemap gates also run (lexer and model parity with
 * v12, which rejects every one).
 */
interface Case {
  id: string;
  name: string;
  source: string;
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Names of rows that must still be in the model. */
  keeps?: string[];
}

const CASES = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/treemap-recovery.json'), 'utf8')
) as Case[];

/** Token type names (`STRING2`, `CLASS_DEF`, …) and grammar rule names, which no message may name. */
const INTERNAL = [
  ...Object.values(LANGIUM_NAMES).filter((n) => /^[A-Z_0-9]{2,}$/.test(n)),
  'TitleAndAccessibilities',
  'TreemapRow',
  'MyNumber',
  'ClassDef',
  'Item',
];

const names = (nodes: readonly TreemapNode[]): string[] =>
  nodes.flatMap((n) => [n.name, ...names(n.children)]);

describe('treemap recovery (R-PARSE-4)', () => {
  it('has at least 20 cases, at least 10 with several independent errors', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.length > 1).length).toBeGreaterThanOrEqual(10);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const src = c.source;
      const { model, diagnostics } = parseTreemap(src);
      const lines = new LineIndex(src);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const kept = names(model.roots);
      for (const k of c.keeps ?? []) expect(kept).toContain(k);
      for (const d of diagnostics) {
        for (const name of INTERNAL) expect(d.message, d.message).not.toContain(name);
      }
    });
  }
});
