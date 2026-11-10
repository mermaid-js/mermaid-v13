import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseTreeView } from '@mermaid-js/diagram-treeview';
import { LANGIUM_NAMES } from '@mermaid-js/diagram-treeview/testing';
import { REPO_ROOT } from '../corpus.ts';

/**
 * Recovery set (R-PARSE-4, #572): documents with N independent errors give N error diagnostics,
 * each on the line where the error was planted (in box drawing too: at the source line, D486),
 * and the nodes around them still reach the model. No message names a token or a grammar rule
 * (R-ERR-5). The cases are `corpus/treeView-recovery.json`, which the treeView gates also run
 * (lexer and model parity with v12, which rejects every one, and the box-mode diagnostics).
 */
interface Case {
  id: string;
  name: string;
  source: string;
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Names of nodes that must still be in the model. */
  keeps?: string[];
}

const CASES = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/treeView-recovery.json'), 'utf8')
) as Case[];

/** Token type names (`BARE_NAME`, …) and grammar rule names, which no message may name. */
const INTERNAL = [
  ...Object.values(LANGIUM_NAMES).filter((n) => /^[A-Z_0-9]{2,}$/.test(n)),
  'TitleAndAccessibilities',
  'TreeNode',
  'TreeView ',
];

describe('treeView recovery (R-PARSE-4)', () => {
  it('has at least 20 cases, at least 10 with several independent errors', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.length > 1).length).toBeGreaterThanOrEqual(10);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const src = c.source;
      const { model, diagnostics } = parseTreeView(src);
      const lines = new LineIndex(src);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const kept = model.nodes.map((n) => n.name);
      for (const k of c.keeps ?? []) expect(kept).toContain(k);
      for (const d of diagnostics) {
        for (const name of INTERNAL) expect(d.message, d.message).not.toContain(name);
      }
    });
  }
});
