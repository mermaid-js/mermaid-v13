import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_DEFAULTS, resolveConfig } from '@mermaid-js/core/config';
import { NO_AST_ID } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { flowchart as plugin, parseFlowchart, type FlowModel } from '@mermaid-js/diagram-flowchart';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { FLOWCHART_FRAGMENTS, mutator, random } from '../fuzz/mutator.ts';
import { leanDifferences, type LeanSubject } from '../lean/differential.ts';
import type { CorpusItem } from '../types.ts';

/**
 * Lean parses (DESIGN §4.2) against full ones over every flowchart source of the repository and
 * seeded mutants of them: the same accept/reject, the same model (its vertex and edge AST ids
 * blanked when the draw writes no `data-ast`), warnings, embeds and edge count.
 */
const flowchart: LeanSubject<FlowModel> = {
  full: (text) => parseFlowchart(text),
  lean: (text, astIds) => parseFlowchart(text, { lean: true, astIds }),
  // The subgraph ids stay: the swimlane warnings report them.
  withoutIds: (model) => ({
    ...model,
    vertices: model.vertices.map((v) => ({ ...v, ast: NO_AST_ID })),
    edges: model.edges.map((e) => ({ ...e, ast: NO_AST_ID })),
  }),
};

const json = (path: string): CorpusItem[] =>
  JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as CorpusItem[];

async function corpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for (const [dir, prefix] of [
    ['e2e/diagrams/flowchart', 'e2e'],
    ['packages/bench/fixtures/corpus', 'bench'],
    ['packages/bench/fixtures/pele', 'pele'],
  ] as const)
    for await (const item of corpusFromDir(join(REPO_ROOT, dir), prefix))
      if (!item.id.startsWith('pele/') || item.id.includes('flowchart')) items.push(item);
  items.push(...json('packages/conformance/corpus/flowchart-v12-specs.json'));
  items.push(...json('packages/conformance/corpus/flowchart-cases.json'));
  return items;
}

const MUTANTS = 3000;

describe('the flowchart plugin (DESIGN §4.2)', () => {
  const text = 'flowchart LR\n  A --> B';
  const ctx = { config: resolveConfig(CORE_DEFAULTS), preprocessed: preprocess(text) };

  it('parses lean when the context asks, with the ids only when asked too', () => {
    const lean = plugin.parse(text, { ...ctx, lean: true });
    expect(lean.lean).toBe(true);
    expect('ast' in lean).toBe(false);
    expect(lean.model.vertices.map((v) => v.ast)).toEqual([NO_AST_ID, NO_AST_ID]);
    const ids = plugin.parse(text, { ...ctx, lean: true, astIds: true });
    expect(ids.model.vertices.map((v) => v.ast)).toEqual(['n:A', 'n:B']);
    expect(plugin.leanParse).toBe(true);
  });

  it('parses in full otherwise', () => {
    const full = plugin.parse(text, ctx);
    expect(full.lean).toBeUndefined();
    expect('ast' in full && full.ast.type).toBe('Document');
  });
});

describe('flowchart lean parses agree with full ones (DESIGN §4.2)', () => {
  it('on every corpus source', { timeout: 60_000 }, async () => {
    const items = await corpus();
    expect(items.length).toBeGreaterThan(1000);
    const disagree = items.flatMap((c) =>
      leanDifferences(flowchart, c.source).map((d) => `${c.id}: ${d}`)
    );
    expect(disagree).toEqual([]);
  });

  // Three parses of each of 3000 mutants: about 4 s alone, so a loaded machine needs room.
  it(`on ${MUTANTS} seeded mutants, accepted and rejected alike`, { timeout: 60_000 }, async () => {
    const sources = (await corpus()).map((c) => c.source);
    const next = mutator(sources, FLOWCHART_FRAGMENTS, random(20261115));
    let rejected = 0;
    const disagree: string[] = [];
    for (let i = 0; i < MUTANTS; i++) {
      const text = next();
      if (parseFlowchart(text).diagnostics.some((d) => d.severity === 'error')) rejected++;
      for (const d of leanDifferences(flowchart, text)) disagree.push(`mutant ${i}: ${d}`);
    }
    expect(disagree).toEqual([]);
    // Both outcomes are exercised.
    expect(rejected).toBeGreaterThan(MUTANTS / 10);
    expect(rejected).toBeLessThan(MUTANTS - MUTANTS / 10);
  });
});
