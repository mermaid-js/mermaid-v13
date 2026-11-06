import { describe, expect, it } from 'vitest';
import { detectTimeline, parseTimeline } from '@mermaid-js/diagram-timeline';
import type { TimelineParseResult } from '@mermaid-js/diagram-timeline';
import { timelineGateCorpus } from './corpus.ts';

/** Offsets probed per source, besides 0 and the end: token edges, evenly spread. */
const PER_SOURCE = 24;

function outputs(r: TimelineParseResult): string {
  const { model, ast, diagnostics, symbols, statements } = r;
  return JSON.stringify({ model, ast, diagnostics, symbols, statements });
}

/** 0, the end, and token starts and ends spread over the source. */
function offsets(r: TimelineParseResult, length: number): number[] {
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
 * R-LANG-7 (#318): a probe changes nothing but `probe`. Model, AST, diagnostics, symbols and
 * statements are the same with and without one, at offsets across the timeline gate corpus
 * (the e2e fixtures, the v12 spec strings, the edge and line-separator cases, rejected ones
 * included, each also commented and CR-cut); the probe reports the offset and a mode (a jison
 * start condition, or where the offset is outside code).
 */
describe('timeline probe leaves the parse unchanged', () => {
  it('over the gate corpus', async () => {
    const sources = (await timelineGateCorpus()).filter((i) => detectTimeline(i.source));
    expect(sources.length).toBeGreaterThan(300);
    const problems: string[] = [];
    let probes = 0;
    for (const { id, source } of sources) {
      const plain = parseTimeline(source, { keepTokens: true });
      const want = outputs(plain);
      for (const at of offsets(plain, source.length)) {
        probes++;
        const r = parseTimeline(source, { keepTokens: true, probe: at });
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
