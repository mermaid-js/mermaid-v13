import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutTreemap, parseTreemap, type TreemapModel } from '@mermaid-js/diagram-treemap';
import {
  treemapLayoutViolations,
  treemapTestContext,
  treemapTestTheme,
} from '@mermaid-js/diagram-treemap/testing';
import type { CorpusItem } from '../types.ts';
import { treemapGateCorpus } from './corpus.ts';
import { generatedTreemap, GENERATED_SEEDS, GENERATED_SIZES } from './generated.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #485): every source of the treemap
 * gate corpus (e2e fixtures, the dev diagram, v12 spec strings, the hand-written cases, each
 * also with CRLF and comment lines) parsed by the v13 parser, rejected sources included (the
 * model of what parsed), laid out with and without a title under several `treemap` configs,
 * gives no `treemapLayoutViolations`; so do generated trees of up to 500 leaves.
 */
const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { showValues: false },
  { padding: 0, valueFormat: '$,.2f' },
  { padding: 3.5, nodeWidth: 37, nodeHeight: 61, valueFormat: '.1%' },
  { padding: 30, nodeWidth: 0, nodeHeight: 0, diagramPadding: 0 },
  { nodeWidth: 20, nodeHeight: 8, diagramPadding: 40 },
];

let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = await treemapTestTheme();
  corpus = await treemapGateCorpus();
});

describe('treemap layout invariants on parser-produced fixtures', () => {
  it('hold over the corpus, with and without a title, and every config', () => {
    const failures: string[] = [];
    let labels = 0;
    let hidden = 0;
    for (const item of corpus) {
      const { model } = parseTreemap(item.source);
      const titled: TreemapModel = { ...model, title: model.title ?? 'A title' };
      for (const m of [model, titled])
        for (const config of CONFIGS) {
          const layout = layoutTreemap(m, treemapTestContext(theme, config));
          for (const leaf of layout.leaves) {
            if (leaf.label) labels++;
            else hidden++;
          }
          const v = treemapLayoutViolations(m, layout);
          if (v.length > 0)
            failures.push(`${item.id} ${JSON.stringify(config)}: ${v.slice(0, 3).join('; ')}`);
        }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(54);
    // Both fitting outcomes are exercised.
    expect(labels).toBeGreaterThan(10_000);
    expect(hidden).toBeGreaterThan(2000);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);

  it('hold over generated trees of up to 500 leaves and every config', () => {
    const failures: string[] = [];
    let truncated = 0;
    for (const leaves of GENERATED_SIZES)
      for (const seed of GENERATED_SEEDS) {
        const model = generatedTreemap(seed, leaves);
        for (const config of CONFIGS) {
          const layout = layoutTreemap(model, treemapTestContext(theme, config));
          truncated += layout.sections.filter((s) => s.label?.text.endsWith('...')).length;
          const v = treemapLayoutViolations(model, layout);
          if (v.length > 0)
            failures.push(
              `${leaves} leaves, seed ${seed} ${JSON.stringify(config)}: ${v.slice(0, 3).join('; ')}`
            );
        }
      }
    expect(truncated).toBeGreaterThan(100);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);
});
