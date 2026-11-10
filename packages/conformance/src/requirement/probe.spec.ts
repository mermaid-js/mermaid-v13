import { describe, expect, it } from 'vitest';
import { parseRequirement } from '@mermaid-js/diagram-requirement';
import type { RequirementParseResult } from '@mermaid-js/diagram-requirement';
import { requirementCases, requirementCorpus, trailingBlanks } from './corpus.ts';

/** Offsets probed per source, besides 0 and the end: token edges, evenly spread. */
const PER_SOURCE = 24;

function outputs(r: RequirementParseResult): string {
  const { model, ast, diagnostics, symbols, statements } = r;
  return JSON.stringify({ model, ast, diagnostics, symbols, statements });
}

/** 0, the end, and token starts and ends spread over the source. */
function offsets(r: RequirementParseResult, length: number): number[] {
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
 * statements are the same with and without one, at offsets across the requirement corpus (the
 * e2e fixtures and harvested v12 strings), the cases file (rejections, recovery, blank and line
 * break forms) and each of them with a blank before every line break (D431's soft line
 * breaks); the probe reports the offset and a mode (a lexer start condition, or where the offset
 * is outside code).
 */
describe('requirement probe leaves the parse unchanged', () => {
  it('over the corpus, the cases and their trailing-blank variants', async () => {
    const base = [...(await requirementCorpus()), ...requirementCases()];
    const sources: [string, string][] = base.flatMap((item) => [
      [item.id, item.source],
      [`${item.id}+blanks`, trailingBlanks(item.source)],
    ]);
    expect(sources.length).toBeGreaterThan(600);
    const problems: string[] = [];
    let probes = 0;
    for (const [id, source] of sources) {
      const plain = parseRequirement(source, { keepTokens: true });
      const want = outputs(plain);
      for (const at of offsets(plain, source.length)) {
        probes++;
        const r = parseRequirement(source, { keepTokens: true, probe: at });
        if (outputs(r) !== want) problems.push(`${id} @${at}: output differs`);
        const p = r.probe;
        if (!p || p.offset !== at || p.prefix.end !== at || p.prefix.start > at || p.mode === '') {
          problems.push(`${id} @${at}: bad probe ${JSON.stringify(p)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(probes).toBeGreaterThan(10_000);
  }, 60_000);
});
