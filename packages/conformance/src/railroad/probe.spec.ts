import { describe, expect, it } from 'vitest';
import { detectRailroad, parseRailroad } from '@mermaid-js/diagram-railroad';
import type { RailroadParseResult } from '@mermaid-js/diagram-railroad';
import { language } from '@mermaid-js/diagram-railroad/language';
import { railroadGateCorpus } from './corpus.ts';

/** Offsets probed per source, besides 0 and the end: token edges, evenly spread. */
const PER_SOURCE = 24;
const NOTATIONS = ['railroad', 'railroadEbnf', 'railroadAbnf', 'railroadPeg'];

function outputs(r: RailroadParseResult): string {
  const { model, ast, diagnostics, symbols, statements } = r;
  return JSON.stringify({ model, ast, diagnostics, symbols, statements });
}

/** 0, the end, and token starts and ends spread over the source. */
function offsets(r: RailroadParseResult, length: number): number[] {
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
 * R-LANG-7 (#616): a probe changes nothing but `probe`. Model, AST, diagnostics, symbols and
 * statements are the same with and without one, at offsets across the railroad gate corpus
 * (the e2e fixtures, the v12 spec strings, the quirk and recovery cases, rejected ones
 * included, each also with CRLF and with comment lines), in each of the four notations, through
 * the parser and through the facet's parse (which adds the language service's hints and folds);
 * the probe reports the offset and a mode (code, a string, a statement's text, or where the
 * offset is outside code).
 */
describe('railroad probe leaves the parse unchanged', () => {
  it('over the gate corpus, per notation', async () => {
    const sources = (await railroadGateCorpus()).filter((i) => detectRailroad(i.source));
    expect(sources.length).toBeGreaterThan(1000);
    const problems: string[] = [];
    const probes = new Map<string, number>();
    for (const { id, source } of sources) {
      const notation = detectRailroad(source)!;
      const parses = [
        (probe?: number) => parseRailroad(source, { keepTokens: true, probe }),
        (probe?: number) =>
          language.parse(source, { keepTokens: true, probe }) as RailroadParseResult,
      ] as const;
      for (const [which, parse] of parses.entries()) {
        const plain = parse();
        const want = outputs(plain);
        for (const at of offsets(plain, source.length)) {
          probes.set(notation, (probes.get(notation) ?? 0) + 1);
          const r = parse(at);
          const where = `${id} (${which === 0 ? 'parser' : 'facet'}) @${at}`;
          if (outputs(r) !== want) problems.push(`${where}: output differs`);
          const p = r.probe;
          if (
            !p ||
            p.offset !== at ||
            p.prefix.end !== at ||
            p.prefix.start > at ||
            p.mode === ''
          ) {
            problems.push(`${where}: bad probe ${JSON.stringify(p)}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
    for (const n of NOTATIONS) expect(probes.get(n), n).toBeGreaterThan(2000);
  }, 120_000);
});
