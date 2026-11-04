import { describe, expect, it } from 'vitest';
import { parseState } from '@mermaid-js/diagram-state';
import type { StateParseResult } from '@mermaid-js/diagram-state';
import { resolveCorpus } from '../corpus.ts';
import { PARITY_SUITES } from '../registry.ts';
import { STATE_ERRORS } from './error-corpus.ts';

/** Offsets probed per source, besides 0 and the end: token edges, evenly spread. */
const PER_SOURCE = 24;

function outputs(r: StateParseResult): string {
  const { model, ast, diagnostics, symbols, statements } = r;
  return JSON.stringify({ model, ast, diagnostics, symbols, statements });
}

/** 0, the end, and token starts and ends spread over the source. */
function offsets(r: StateParseResult, length: number): number[] {
  const tokens = r.tokens;
  const out = new Set([0, length]);
  if (!tokens) return [...out];
  const step = Math.max(1, Math.floor(tokens.length / PER_SOURCE));
  for (let j = 0; j < tokens.length; j += step) {
    out.add(tokens.start[j] ?? 0);
    out.add(tokens.end[j] ?? 0);
  }
  return [...out];
}

/**
 * R-LANG-7: a probe changes nothing but `probe`. Model, AST, diagnostics, symbols and
 * statements are the same with and without one, at offsets across every corpus and error
 * corpus source (comments, CRLF and mid-line errors included).
 */
describe('state probe leaves the parse unchanged', () => {
  it('over the corpus and the error corpus', async () => {
    const sources: [string, string][] = [...STATE_ERRORS];
    for await (const item of resolveCorpus(
      {},
      PARITY_SUITES.filter((s) => s.adapter.id === 'state')
    ))
      sources.push([item.id, item.source]);
    expect(sources.length).toBeGreaterThan(250);
    const problems: string[] = [];
    let probes = 0;
    for (const [id, source] of sources) {
      const plain = parseState(source, { keepTokens: true });
      const want = outputs(plain);
      for (const at of offsets(plain, source.length)) {
        probes++;
        const r = parseState(source, { keepTokens: true, probe: at });
        if (outputs(r) !== want) problems.push(`${id} @${at}: output differs`);
        const p = r.probe;
        if (!p || p.offset !== at || p.prefix.end !== at || p.prefix.start > at) {
          problems.push(`${id} @${at}: bad probe ${JSON.stringify(p)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(probes).toBeGreaterThan(3000);
    // ~12k parses: about 3 s alone, longer beside a full `pnpm test` (it is a sweep, not a timing).
  }, 60_000);
});
