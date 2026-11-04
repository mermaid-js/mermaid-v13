import { describe, expect, it } from 'vitest';
import { detectEr, parseEr } from '@mermaid-js/diagram-er';
import type { ErParseResult } from '@mermaid-js/diagram-er';
import { resolveCorpus } from '../corpus.ts';
import { PARITY_SUITES } from '../registry.ts';
import { ER_ERRORS } from './error-corpus.ts';

/** Offsets probed per source, besides 0 and the end: token edges, evenly spread. */
const PER_SOURCE = 24;

function outputs(r: ErParseResult): string {
  const { model, ast, diagnostics, symbols, statements } = r;
  return JSON.stringify({ model, ast, diagnostics, symbols, statements });
}

/** 0, the end, and token starts and ends spread over the source. */
function offsets(r: ErParseResult, length: number): number[] {
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
 * statements are the same with and without one, at offsets across every ER corpus and error
 * corpus source; the probe reports the offset and a mode (a lexer start condition, or where
 * the offset is outside code).
 */
describe('er probe leaves the parse unchanged', () => {
  it('over the corpus and the error corpus', async () => {
    const sources: [string, string][] = [...ER_ERRORS];
    for await (const item of resolveCorpus({}, PARITY_SUITES)) {
      if (detectEr(item.source)) sources.push([item.id, item.source]);
    }
    expect(sources.length).toBeGreaterThan(400);
    const problems: string[] = [];
    let probes = 0;
    for (const [id, source] of sources) {
      const plain = parseEr(source, { keepTokens: true });
      const want = outputs(plain);
      for (const at of offsets(plain, source.length)) {
        probes++;
        const r = parseEr(source, { keepTokens: true, probe: at });
        if (outputs(r) !== want) problems.push(`${id} @${at}: output differs`);
        const p = r.probe;
        if (!p || p.offset !== at || p.prefix.end !== at || p.prefix.start > at || p.mode === '') {
          problems.push(`${id} @${at}: bad probe ${JSON.stringify(p)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(probes).toBeGreaterThan(5000);
  }, 60_000);
});
