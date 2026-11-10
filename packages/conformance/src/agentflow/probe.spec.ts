import { describe, expect, it } from 'vitest';
import { detectAgentflow, parseAgentflow } from '@mermaid-js/diagram-agentflow';
import type { AgentflowParseResult } from '@mermaid-js/diagram-agentflow';
import { agentflowGateCorpus } from './corpus.ts';

/** Offsets probed per source, besides 0 and the end: token edges, evenly spread. */
const PER_SOURCE = 24;

function outputs(r: AgentflowParseResult): string {
  const { model, ast, diagnostics, symbols, statements } = r;
  return JSON.stringify({ model, ast, diagnostics, symbols, statements });
}

/** 0, the end, and token starts and ends spread over the source. */
function offsets(r: AgentflowParseResult, length: number): number[] {
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
 * R-LANG-7 (#549): a probe changes nothing but `probe`. Model, AST, diagnostics, symbols and
 * statements are the same with and without one, at offsets across the agentflow gate corpus
 * (the e2e fixtures, the v12 spec strings and the cases, rejected ones included, each in every
 * generated variant: comments, CR and CRLF, line and paragraph separators, multi-line metadata,
 * mid-line directives); the probe reports the offset and a mode (a jison start condition, or
 * where the offset is outside code).
 */
describe('agentflow probe leaves the parse unchanged', () => {
  it('over the gate corpus', async () => {
    const sources = (await agentflowGateCorpus()).filter((i) => detectAgentflow(i.source));
    expect(sources.length).toBeGreaterThan(3000);
    const problems: string[] = [];
    let probes = 0;
    for (const { id, source } of sources) {
      const plain = parseAgentflow(source, { keepTokens: true });
      const want = outputs(plain);
      for (const at of offsets(plain, source.length)) {
        probes++;
        const r = parseAgentflow(source, { keepTokens: true, probe: at });
        if (outputs(r) !== want) problems.push(`${id} @${at}: output differs`);
        const p = r.probe;
        if (!p || p.offset !== at || p.prefix.end !== at || p.prefix.start > at || p.mode === '') {
          problems.push(`${id} @${at}: bad probe ${JSON.stringify(p)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(probes).toBeGreaterThan(50_000);
  }, 300_000);
});
