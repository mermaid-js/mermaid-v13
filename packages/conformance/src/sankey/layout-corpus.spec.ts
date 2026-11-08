import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutSankey, parseSankey, SANKEY_CYCLE } from '@mermaid-js/diagram-sankey';
import {
  sankeyLayoutViolations,
  sankeyTestContext,
  sankeyTestTheme,
} from '@mermaid-js/diagram-sankey/testing';
import type { CorpusItem } from '../types.ts';
import { sankeyGateCorpus } from './corpus.ts';
import { GENERATED_SEEDS, GENERATED_SIZES, generatedSankey } from './generated.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #499): every source of the
 * sankey gate corpus (e2e fixtures, v12 spec and syntax-page strings, the cases, each in its
 * generated variants) parsed by the v13 parser, rejected sources included (the model of what
 * parsed) except cycles (D393: rejected before layout), and the generated DAGs of up to 200
 * nodes, laid out for all four aligns, both label styles and several `sankey` configs, give no
 * `sankeyLayoutViolations`: no NaN, nodes inside the extent and apart by the padding, heights
 * and widths proportional to the flows, links on their nodes' edges, contents inside the bounds.
 * The cases where d3 wrote NaN (every flow 0) are among them.
 */
const ALIGNS = ['justify', 'left', 'right', 'center'] as const;
const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { showValues: false, labelStyle: 'outlined' },
  { width: 410, nodeWidth: 20, nodePadding: 0, labelStyle: 'outlined' },
  { width: 800, height: 500, prefix: '$', suffix: 'B', nodeColors: { a: '#123456' } },
  { height: 60 },
  { height: 0, width: 10, nodeWidth: 0 },
];

let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = await sankeyTestTheme();
  corpus = await sankeyGateCorpus();
});

function violations(source: string, id: string, failures: string[]): number {
  const { model, diagnostics } = parseSankey(source);
  if (diagnostics.some((d) => d.code === SANKEY_CYCLE)) return 0;
  for (const nodeAlignment of ALIGNS)
    for (const config of CONFIGS) {
      const section = { ...config, nodeAlignment };
      const layout = layoutSankey(model, sankeyTestContext(theme, section));
      const v = sankeyLayoutViolations(model, layout, section);
      if (v.length > 0)
        failures.push(`${id} ${JSON.stringify(section)}: ${v.slice(0, 3).join('; ')}`);
    }
  return model.nodes.length;
}

describe('sankey layout invariants on parser-produced fixtures', () => {
  it('hold over the gate corpus, every align and config', () => {
    const failures: string[] = [];
    let nodes = 0;
    for (const item of corpus) nodes += violations(item.source, item.id, failures);
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(18);
    expect(nodes).toBeGreaterThan(3000);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);

  it('hold over generated DAGs of up to 200 nodes', () => {
    const failures: string[] = [];
    let nodes = 0;
    for (const size of GENERATED_SIZES)
      for (const seed of GENERATED_SEEDS)
        nodes += violations(generatedSankey(seed, size), `${size} nodes, seed ${seed}`, failures);
    expect(nodes).toBeGreaterThan(3000);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);
});
