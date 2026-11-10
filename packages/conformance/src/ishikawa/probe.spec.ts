import { describe, expect, it } from 'vitest';
import { detectIshikawa, parseIshikawa } from '@mermaid-js/diagram-ishikawa';
import type { IshikawaParseResult } from '@mermaid-js/diagram-ishikawa';
import { ishikawaGateCorpus } from './corpus.ts';

/** Offsets probed per source, besides 0 and the end: token edges, evenly spread. */
const PER_SOURCE = 24;

function outputs(r: IshikawaParseResult): string {
  const { model, ast, diagnostics, symbols, statements } = r;
  return JSON.stringify({ model, ast, diagnostics, symbols, statements });
}

/** 0, the end, and token starts and ends spread over the source. */
function offsets(r: IshikawaParseResult, length: number): number[] {
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
 * R-LANG-7 (#584): a probe changes nothing but `probe`. Model, AST, diagnostics, symbols and
 * statements are the same with and without one, at offsets across the ishikawa gate corpus (the
 * e2e fixtures, the v12 spec strings and the cases, rejected ones included, each in every
 * generated variant), with and without `clampPerCause`; the probe reports the offset
 * and a mode (`INITIAL`, or where the offset is outside code).
 */
describe('ishikawa probe leaves the parse unchanged', () => {
  it('over the gate corpus', async () => {
    const sources = (await ishikawaGateCorpus()).filter((i) => detectIshikawa(i.source));
    expect(sources.length).toBeGreaterThan(1000);
    const problems: string[] = [];
    let probes = 0;
    const modes = new Set<string>();
    for (const { id, source } of sources) {
      for (const clampPerCause of [false, true]) {
        const plain = parseIshikawa(source, { keepTokens: true, clampPerCause });
        const want = outputs(plain);
        for (const at of offsets(plain, source.length)) {
          probes++;
          const r = parseIshikawa(source, { keepTokens: true, clampPerCause, probe: at });
          if (outputs(r) !== want) problems.push(`${id} @${at}: output differs`);
          const p = r.probe;
          if (
            !p ||
            p.offset !== at ||
            p.prefix.end !== at ||
            p.prefix.start > at ||
            p.mode === ''
          ) {
            problems.push(`${id} @${at}: bad probe ${JSON.stringify(p)}`);
          } else modes.add(p.mode);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(probes).toBeGreaterThan(20_000);
    expect([...modes].sort()).toEqual(['INITIAL', 'comment', 'directive', 'frontMatter']);
  }, 120_000);
});
