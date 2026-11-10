import { describe, expect, it } from 'vitest';
import { detectUsecase, parseUsecase } from '@mermaid-js/diagram-usecase';
import type { UsecaseParseResult } from '@mermaid-js/diagram-usecase';
import { usecaseGateCorpus } from './corpus.ts';

/** Offsets probed per source, besides 0 and the end: token edges, evenly spread. */
const PER_SOURCE = 24;

const MODES = new Set([
  'default',
  'jsonBody',
  'stereotype',
  'string',
  'acc',
  'comment',
  'directive',
  'frontMatter',
]);

function outputs(r: UsecaseParseResult): string {
  const { model, ast, diagnostics, symbols, statements } = r;
  return JSON.stringify({ model, ast, diagnostics, symbols, statements });
}

/** 0, the end, and token starts and ends spread over the source. */
function offsets(r: UsecaseParseResult, length: number): number[] {
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
 * R-LANG-7 (#568): a probe changes nothing but `probe`. Model, AST, diagnostics, symbols and
 * statements are the same with and without one, at offsets across the usecase gate corpus (the
 * e2e fixtures, the v12 spec strings and the cases, rejected ones included, each in every
 * generated variant); the probe reports the offset and a mode (v12's lexer mode, `string`,
 * `acc` or `jsonBody` inside a value, or where the offset is outside code).
 */
describe('usecase probe leaves the parse unchanged', () => {
  it('over the gate corpus', async () => {
    const sources = (await usecaseGateCorpus()).filter((i) => detectUsecase(i.source));
    expect(sources.length).toBeGreaterThan(1000);
    const problems: string[] = [];
    let probes = 0;
    for (const { id, source } of sources) {
      const plain = parseUsecase(source, { keepTokens: true });
      const want = outputs(plain);
      for (const at of offsets(plain, source.length)) {
        probes++;
        const r = parseUsecase(source, { keepTokens: true, probe: at });
        if (outputs(r) !== want) problems.push(`${id} @${at}: output differs`);
        const p = r.probe;
        if (
          !p ||
          p.offset !== at ||
          p.prefix.end !== at ||
          p.prefix.start > at ||
          !MODES.has(p.mode)
        ) {
          problems.push(`${id} @${at}: bad probe ${JSON.stringify(p)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(probes).toBeGreaterThan(20_000);
  }, 120_000);
});
