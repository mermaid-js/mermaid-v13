import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import {
  layoutSankey,
  parseSankey,
  SANKEY_CYCLE,
  type SankeyModel,
} from '@mermaid-js/diagram-sankey';
import { sankeyTestContext, sankeyTestTheme } from '@mermaid-js/diagram-sankey/testing';
import type { CorpusItem } from '../types.ts';
import { sankeyGateCorpus } from './corpus.ts';
import { loadD3Sankey, v12Sankey, type D3, type SankeyAlign } from './d3.ts';
import { GENERATED_SEEDS, GENERATED_SIZES, generatedSankey } from './generated.ts';

/**
 * The sankey layout's boxes are d3-sankey 0.12.3's (#499, R-LAYOUT-3): v12's
 * `sankeyRenderer.ts:113-134` run over the real d3-sankey that mermaid\@12.2.0 resolves, on
 * every model of the gate corpus (parsed by the v13 parser, with each link's `flow`, D394) and
 * on generated DAGs of up to 200 nodes, for all four aligns and several `sankey` configs. Node
 * boxes, link widths and centre lines agree within 1e-9 px, and each link's path is d3-shape's
 * `linkHorizontal` through the same points.
 *
 * Sources whose cycles the parser rejects (D393) are not laid out. Where every flow is 0, d3
 * writes NaN (its `ky` is Infinity) and v13 does not (D394): those sources are listed in
 * `D3_NAN`, and the invariants spec checks v13's layout of them.
 */
const D3_NAN = [
  'sankey-cases/values-infinity',
  'sankey-cases/values-nan',
  'sankey-cases/values-negative-zero-sign',
  'sankey-cases/values-overflow',
];
const ALIGNS: readonly SankeyAlign[] = ['justify', 'left', 'right', 'center'];
const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { showValues: false },
  { width: 410, nodeWidth: 20, nodePadding: 0 },
  { width: 800, height: 500, nodePadding: 30 },
  { height: 60 },
  { width: 1200, height: 150, nodeWidth: 3.5, nodePadding: 7.25, showValues: false },
];
const TOLERANCE = 1e-9;

let d3: D3;
let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  d3 = loadD3Sankey();
  theme = await sankeyTestTheme();
  corpus = await sankeyGateCorpus();
});

const numbers = (d: string): number[] => (d.match(/-?[\d.]+(?:e[-+]?\d+)?/g) ?? []).map(Number);

/** Every difference between v13's layout and d3's for `model`; `['d3 NaN']` when d3 has NaN. */
function differences(model: SankeyModel, section: Record<string, unknown>): string[] {
  const options = {
    width: 600,
    height: 400,
    nodeWidth: 10,
    nodePadding: 12,
    showValues: true,
    nodeAlignment: 'justify' as SankeyAlign,
    ...section,
  };
  const graph = v12Sankey(
    d3,
    {
      nodes: model.nodes.map((n) => n.id),
      links: model.links.map((l) => ({ source: l.source, target: l.target, value: l.flow })),
    },
    options
  );
  if (graph.nodes.some((n) => [n.x0, n.x1, n.y0, n.y1].some(Number.isNaN))) return ['d3 NaN'];
  const layout = layoutSankey(model, sankeyTestContext(theme, section));
  const out: string[] = [];
  const far = (a: number, b: number): boolean => !(Math.abs(a - b) <= TOLERANCE);
  graph.nodes.forEach((want, i) => {
    const got = layout.nodes[i];
    if (!got || got.id !== want.id) {
      out.push(`node ${i}: ${got?.id} ≠ d3's ${want.id}`);
      return;
    }
    const keys = ['x0', 'x1', 'y0', 'y1'] as const;
    if (keys.some((k) => far(got[k], want[k])) || got.layer !== want.layer)
      out.push(
        `node ${want.id}: ${keys.map((k) => got[k]).join()} L${got.layer} ≠ d3's ${keys.map((k) => want[k]).join()} L${want.layer}`
      );
  });
  graph.links.forEach((want, i) => {
    const got = layout.links[i];
    if (!got) return;
    if (far(got.width, want.width) || far(got.y0, want.y0) || far(got.y1, want.y1))
      out.push(
        `link ${i}: ${got.width},${got.y0},${got.y1} ≠ d3's ${want.width},${want.y0},${want.y1}`
      );
    const { from, c1, c2, to } = got.path;
    const path = [from, c1, c2, to].flatMap((p) => [p.x, p.y]);
    const d3Path = numbers(d3.linkHorizontal(want));
    if (path.length !== d3Path.length || path.some((v, k) => far(v, d3Path[k]!)))
      out.push(`link ${i}'s path ${path.join()} ≠ d3's ${d3.linkHorizontal(want)}`);
  });
  if (layout.nodes.length !== graph.nodes.length || layout.links.length !== graph.links.length)
    out.push('counts differ');
  return out;
}

const cyclic = (src: string): boolean =>
  parseSankey(src).diagnostics.some((d) => d.code === SANKEY_CYCLE);

describe('sankey boxes equal d3-sankey 0.12.3', () => {
  it('reaches d3-sankey 0.12.3, as mermaid@12.2.0 resolves it', () => {
    expect(d3.version).toBe('0.12.3');
  });

  it('on the gate corpus, every align and config', () => {
    const failures: string[] = [];
    const nan = new Set<string>();
    let nodes = 0;
    let skipped = 0;
    for (const item of corpus) {
      if (cyclic(item.source)) {
        skipped++;
        continue;
      }
      const { model } = parseSankey(item.source);
      if (model.nodes.length === 0) continue;
      nodes += model.nodes.length;
      for (const nodeAlignment of ALIGNS)
        for (const config of CONFIGS) {
          const section = { ...config, nodeAlignment };
          const d = differences(model, section);
          if (d[0] === 'd3 NaN') {
            nan.add(item.id.replace(/ \([^)]*\)$/, ''));
            continue;
          }
          if (d.length > 0)
            failures.push(`${item.id} ${JSON.stringify(section)}: ${d.slice(0, 3).join('; ')}`);
        }
    }
    expect(corpus.length).toBeGreaterThan(1000);
    expect(nodes).toBeGreaterThan(3000);
    expect(skipped).toBeGreaterThan(0);
    expect([...nan].sort()).toEqual(D3_NAN);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);

  it('on generated DAGs of up to 200 nodes', () => {
    const failures: string[] = [];
    let drawn = 0;
    for (const size of GENERATED_SIZES)
      for (const seed of GENERATED_SEEDS) {
        const src = generatedSankey(seed, size);
        const { model, diagnostics } = parseSankey(src);
        expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        drawn += model.nodes.length;
        for (const nodeAlignment of ALIGNS)
          for (const config of CONFIGS) {
            const section = { ...config, nodeAlignment };
            const d = differences(model, section);
            if (d.length > 0)
              failures.push(
                `${size} nodes, seed ${seed} ${JSON.stringify(section)}: ${d.slice(0, 3).join('; ')}`
              );
          }
      }
    expect(drawn).toBeGreaterThan(3000);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);
});
