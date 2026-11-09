import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { parseEventModel } from '@mermaid-js/diagram-eventmodeling';
import { LANGIUM_NAMES } from '@mermaid-js/diagram-eventmodeling/testing';
import { REPO_ROOT } from '../corpus.ts';

/**
 * Recovery set (R-PARSE-4): documents with N independent errors give N error diagnostics, each
 * on the line where the error was planted, and the frames around them still reach the model.
 * The set has v12's thrown duplicate-id error, keyword names, stray characters, unclosed data,
 * broken frames, data blocks, notes and `gwt` specifications, and errors on one line. No
 * message names a token or a grammar rule (R-ERR-5). The cases are
 * `corpus/eventmodeling-recovery.json`, which the event modeling gates also run (lexer and
 * model parity with v12).
 */
interface Case {
  id: string;
  name: string;
  source: string;
  /** `[code, 1-based line]` of every expected error, in order. */
  errors: [string, number][];
  /** Frame ids that must still be in the model. */
  keeps?: string[];
}

const CASES = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/eventmodeling-recovery.json'), 'utf8')
) as Case[];

/** Chevrotain token names (`EM_ID`, `EM_FID`, …) and v12's grammar rule names. */
const INTERNAL = [
  ...Object.values(LANGIUM_NAMES).filter((n) => /^[A-Z_]{3,}$/.test(n)),
  'EmFrame',
  'EmTimeFrame',
  'EmResetFrame',
  'EmModelEntity',
  'EmDataEntity',
  'EmNoteEntity',
  'EmGwt',
  'QualifiedName',
  'EmDataInline',
  'EmDataBlock',
  'EOF',
];

describe('event modeling recovery (R-PARSE-4)', () => {
  it('has at least 20 cases, at least 10 with several errors, duplicate ids among them', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.length > 1).length).toBeGreaterThanOrEqual(10);
    const duplicates = CASES.filter((c) =>
      c.errors.some(([code]) => code === 'EVENTMODELING_DUPLICATE_FRAME')
    );
    expect(duplicates.length).toBeGreaterThanOrEqual(3);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const src = c.source;
      const { model, diagnostics } = parseEventModel(src);
      const lines = new LineIndex(src);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const ids = model.frames.map((f) => f.id);
      for (const k of c.keeps ?? []) expect(ids).toContain(k);
      for (const d of diagnostics) {
        for (const name of INTERNAL) expect(d.message, d.message).not.toContain(name);
      }
    });
  }
});
