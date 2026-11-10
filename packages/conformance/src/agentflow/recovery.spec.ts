import { describe, expect, it } from 'vitest';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { AgentflowTokenKind, JISON_NAMES, parseAgentflow } from '@mermaid-js/diagram-agentflow';
import { loadOracle } from '../oracle.ts';
import type { CorpusItem } from '../types.ts';
import { agentflowCases } from './corpus.ts';

/**
 * Recovery set (R-PARSE-4, #546): the `agentflow-cases/recovery-…` sources of
 * `corpus/agentflow-cases.json` each plant N independent errors and list them as
 * `errors: [code, 1-based line][]`. The parser gives exactly those N error diagnostics, the
 * vertices in `keeps` still reach the model, mermaid\@12 rejects every one of them (it stops at
 * the first), and no message names a token or a grammar rule (R-ERR-5).
 *
 * A syntax error resyncs at the next line break, `;` or comment; an unclosed label or string
 * restarts the lexer on the line after its opener; a block whose header fails still opens, so
 * its `end` closes it, and a missing `end` is part of the header's error; a stray `end` takes
 * the rest of its statement. Semantic errors (YAML, shapes, link indexes) do not stop the
 * statement, so they add to a syntax error on the same line.
 */
interface RecoveryCase extends CorpusItem {
  errors: [code: string, line: number][];
  keeps: string[];
}

/** Token kind and jison terminal names, and grammar rule names, which no message may hold. */
const INTERNAL_NAMES = new RegExp(
  `\\b(?:${[
    ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
    ...Object.keys(AgentflowTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
    'textNoTags',
    'vertexStatement',
    'stylesOpt',
    'idString',
    'shapeData',
    'graphConfig',
    'spaceListNewline',
  ].join('|')})\\b`
);

/** A message without the source text it quotes. */
const withoutQuotes = (message: string): string =>
  message
    .replace(/got `[\s\S]*?`/g, 'got `…`')
    .replace(/character `[\s\S]*?`/g, 'character `…`')
    .replace(/the `[^`]*` at line/g, 'the `…` at line')
    .replace(/No such shape: [^.]*\./g, 'No such shape: ….');

const CASES = agentflowCases().filter((c): c is RecoveryCase =>
  c.id.startsWith('agentflow-cases/recovery-')
);

describe('agentflow recovery (R-PARSE-4)', () => {
  it('has at least 20 cases, several with more than one error', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.filter((c) => c.errors.length >= 2).length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...CASES.map((c) => c.errors.length))).toBeGreaterThanOrEqual(5);
    // Two errors on one line: a semantic error, then a syntax error.
    const onOneLine = (c: RecoveryCase) =>
      c.errors.some(([, line], i) => c.errors.findIndex(([, l]) => l === line) !== i);
    expect(CASES.filter(onOneLine).length).toBeGreaterThanOrEqual(1);
  });

  for (const c of CASES) {
    it(c.id, async () => {
      const { model, diagnostics } = parseAgentflow(c.source);
      const lines = new LineIndex(c.source);
      const errors = diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => [d.code, lines.position(d.range.start).line + 1]);
      expect(errors).toEqual(c.errors);
      const kept = model.vertices.map((v) => v.id);
      for (const k of c.keeps) expect(kept).toContain(k);
      for (const d of diagnostics) expect(withoutQuotes(d.message)).not.toMatch(INTERNAL_NAMES);
      const v12 = await (await loadOracle()).parse(c.source);
      expect(v12.accepted).toBe(false);
    });
  }
});
