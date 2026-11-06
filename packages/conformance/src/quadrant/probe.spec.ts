import { describe, expect, it } from 'vitest';
import { parseQuadrant } from '@mermaid-js/diagram-quadrant';
import type { QuadrantParseResult } from '@mermaid-js/diagram-quadrant';
import { quadrantGateCorpus } from './corpus.ts';

/** Offsets probed per source, besides 0 and the end: token edges, evenly spread. */
const PER_SOURCE = 24;

function outputs(r: QuadrantParseResult): string {
  const { model, ast, diagnostics, symbols, statements } = r;
  return JSON.stringify({ model, ast, diagnostics, symbols, statements });
}

/**
 * R-LANG-7: a probe changes nothing but `probe`. Model, AST, diagnostics, symbols and
 * statements are the same with and without one, at offsets across the quadrant gate corpus
 * (e2e fixtures, v12 spec strings, parser cases and lexer quirks, each also with comment lines
 * added); the probe reports the offset and a mode (a lexer start condition, or where the
 * offset is outside code).
 */
describe('quadrant probe leaves the parse unchanged', () => {
  it('over the gate corpus', async () => {
    const sources = await quadrantGateCorpus();
    expect(sources.length).toBeGreaterThan(300);
    const problems: string[] = [];
    let probes = 0;
    for (const { id, source } of sources) {
      const plain = parseQuadrant(source, { keepTokens: true });
      const want = outputs(plain);
      const at = new Set([0, source.length]);
      const tokens = plain.tokens;
      if (tokens) {
        const step = Math.max(1, Math.floor(tokens.length / PER_SOURCE));
        for (let j = 0; j < tokens.length; j += step) {
          at.add(tokens.start[j] ?? 0);
          at.add(tokens.end[j] ?? 0);
        }
      }
      for (const offset of at) {
        probes++;
        const r = parseQuadrant(source, { keepTokens: true, probe: offset });
        if (outputs(r) !== want) problems.push(`${id} @${offset}: output differs`);
        const p = r.probe;
        if (
          !p ||
          p.offset !== offset ||
          p.prefix.end !== offset ||
          p.prefix.start > offset ||
          p.mode === ''
        ) {
          problems.push(`${id} @${offset}: bad probe ${JSON.stringify(p)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(probes).toBeGreaterThan(5000);
  }, 60_000);
});
