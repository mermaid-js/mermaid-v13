import { describe, expect, it } from 'vitest';
import { parseClass } from '@mermaid-js/diagram-class';
import type { ClassParseResult } from '@mermaid-js/diagram-class';
import { classCorpus } from './grammar/corpus.ts';

/** Offsets probed per source, besides 0 and the end: token edges, evenly spread. */
const PER_SOURCE = 16;

function outputs(r: ClassParseResult): string {
  const { model, ast, diagnostics, symbols, statements } = r;
  return JSON.stringify({ model, ast, diagnostics, symbols, statements });
}

/**
 * R-LANG-7: a probe changes nothing but `probe`. Model, AST, diagnostics, symbols and
 * statements are the same with and without one, at offsets across every corpus source.
 */
describe('class probe leaves the parse unchanged', () => {
  it('over the corpus', async () => {
    const problems: string[] = [];
    let probes = 0;
    for (const { id, source } of await classCorpus()) {
      const plain = parseClass(source, { keepTokens: true });
      const want = outputs(plain);
      const tokens = plain.tokens;
      const at = new Set([0, source.length]);
      if (tokens) {
        const step = Math.max(1, Math.floor(tokens.length / PER_SOURCE));
        for (let j = 0; j < tokens.length; j += step) {
          at.add(tokens.start[j] ?? 0);
          at.add(tokens.end[j] ?? 0);
        }
      }
      for (const offset of at) {
        probes++;
        const r = parseClass(source, { keepTokens: true, probe: offset });
        if (outputs(r) !== want) problems.push(`${id} @${offset}: output differs`);
        const p = r.probe;
        if (!p || p.offset !== offset || p.prefix.end !== offset || p.prefix.start > offset) {
          problems.push(`${id} @${offset}: bad probe ${JSON.stringify(p)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(probes).toBeGreaterThan(5000);
  }, 60_000);
});
