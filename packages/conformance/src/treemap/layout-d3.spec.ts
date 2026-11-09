import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import {
  layoutTreemap,
  parseTreemap,
  type TreemapModel,
  type TreemapNode,
} from '@mermaid-js/diagram-treemap';
import { treemapTestContext, treemapTestTheme } from '@mermaid-js/diagram-treemap/testing';
import type { CorpusItem } from '../types.ts';
import { treemapGateCorpus } from './corpus.ts';
import { count, generatedTreemap, GENERATED_SEEDS, GENERATED_SIZES } from './generated.ts';
import { loadD3, v12Treemap, type D3, type D3Node } from './d3.ts';

/**
 * The treemap layout's rectangles are d3-hierarchy 3's (#485, R-LAYOUT-3): v12's
 * `renderer.ts:144-161` run over the real d3-hierarchy 3.1.2 that mermaid\@12.2.0 resolves, on
 * every model of the gate corpus (parsed by the v13 parser) and on generated trees of up to 500
 * leaves, under several `treemap` configs, with and without a title. The sections are d3's
 * nodes with children in `descendants()` order with v12's `section<i>` index, the leaves d3's
 * `leaves()` with `leaf<i>`.
 *
 * Where d3 writes NaN (a value of 309 digits is Infinity, and a sum that overflows), v13 does
 * not (D402): those sources are listed in `D3_NAN`, and the invariants spec checks v13's layout
 * of them.
 */
const D3_NAN = ['treemap-cases/layout-huge-value', 'treemap-cases/layout-overflow'];
const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { padding: 0 },
  { padding: 3.5, nodeWidth: 37, nodeHeight: 61 },
  { padding: 30, nodeWidth: 0, nodeHeight: 0 },
  { padding: 1, nodeWidth: 250, nodeHeight: 12.5 },
  { padding: 0.3, nodeWidth: 33.3, nodeHeight: 77.7 },
];

let d3: D3;
let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  d3 = await loadD3();
  theme = await treemapTestTheme();
  corpus = await treemapGateCorpus();
});

type Data = { name: string; children?: readonly TreemapNode[] } | TreemapNode;

/** v12's canvas for a config: `nodeWidth × 10` (960 when 0), `nodeHeight × 10` (500). */
function canvas(config: Record<string, unknown>): { width: number; height: number } {
  const w = (config.nodeWidth as number | undefined) ?? 100;
  const h = (config.nodeHeight as number | undefined) ?? 40;
  return { width: w ? w * 10 : 960, height: h ? h * 10 : 500 };
}

/** Every difference between v13's rectangles and d3's for `model`. */
function differences(model: TreemapModel, config: Record<string, unknown>): string[] {
  const root: Data = { name: '', children: model.roots };
  const tree = v12Treemap<Data>(d3, root, {
    ...canvas(config),
    padding: (config.padding as number | undefined) ?? 10,
  });
  if (tree.descendants().some((d) => Number.isNaN(d.x0 + d.y0 + d.x1 + d.y1))) return ['d3 NaN'];
  const layout = layoutTreemap(model, treemapTestContext(theme, config));
  const band = layout.titleBand;
  const out: string[] = [];
  const compare = (
    kind: string,
    want: D3Node<Data>[],
    got: readonly {
      index: number;
      node: TreemapNode;
      box: { x: number; y: number; width: number; height: number };
    }[]
  ): void => {
    const expected = want
      .map((d, index) => ({ d, index }))
      .filter(({ d }) => d.depth > 0)
      .map(({ d, index }) => ({
        node: d.data,
        index,
        box: { x: d.x0, y: d.y0 + band, width: d.x1 - d.x0, height: d.y1 - d.y0 },
      }));
    if (expected.length !== got.length)
      out.push(`${kind}: ${got.length} ≠ d3's ${expected.length}`);
    expected.forEach((e, i) => {
      const g = got[i];
      if (!g) return;
      if (g.node !== e.node || g.index !== e.index)
        out.push(
          `${kind} ${i}: ${g.node.astId}#${g.index} ≠ d3's ${(e.node as TreemapNode).astId}#${e.index}`
        );
      else if (JSON.stringify(g.box) !== JSON.stringify(e.box))
        out.push(
          `${kind} ${g.node.astId}: ${JSON.stringify(g.box)} ≠ d3's ${JSON.stringify(e.box)}`
        );
    });
  };
  compare(
    'section',
    tree.descendants().filter((d) => d.children !== undefined),
    layout.sections
  );
  compare('leaf', tree.leaves(), layout.leaves);
  return out;
}

describe('treemap rectangles equal d3-hierarchy 3', () => {
  it('reaches d3-hierarchy 3.1.2, as mermaid@12.2.0 resolves it', () => {
    expect(d3.versions.hierarchy).toBe('3.1.2');
  });

  it('on the gate corpus, every config, with and without a title', () => {
    const failures: string[] = [];
    const nan = new Set<string>();
    let nodes = 0;
    for (const item of corpus) {
      const { model } = parseTreemap(item.source);
      nodes += count(model.roots);
      for (const m of [model, { ...model, title: 'A title' }])
        for (const config of CONFIGS) {
          const d = differences(m, config);
          if (d[0] === 'd3 NaN') {
            nan.add(item.id.replace(/ \((CRLF|commented)\)$/, ''));
            continue;
          }
          if (d.length > 0)
            failures.push(`${item.id} ${JSON.stringify(config)}: ${d.slice(0, 3).join('; ')}`);
        }
    }
    expect(corpus.length).toBeGreaterThan(800);
    expect(nodes).toBeGreaterThan(1500);
    expect([...nan].sort()).toEqual(D3_NAN);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);

  it('on generated trees of up to 500 leaves', () => {
    const failures: string[] = [];
    let drawn = 0;
    for (const leaves of GENERATED_SIZES)
      for (const seed of GENERATED_SEEDS) {
        const model = generatedTreemap(seed, leaves);
        drawn += count(model.roots);
        for (const config of CONFIGS) {
          const d = differences(model, config);
          if (d.length > 0)
            failures.push(
              `${leaves} leaves, seed ${seed} ${JSON.stringify(config)}: ${d.slice(0, 3).join('; ')}`
            );
        }
      }
    expect(drawn).toBeGreaterThan(9000);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);
});
