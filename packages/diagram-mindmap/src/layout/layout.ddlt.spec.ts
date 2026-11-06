// DDLT on hand-built mindmaps (spec #294 T3): every shape, with and without icons, chains, fans
// and seeded random trees, through `layoutMindmap` (the one entry point the plugin calls) with
// `tree` and `layered`. ELK and the parser-produced corpus are in
// `packages/conformance/src/mindmap/layout.spec.ts`.
import { describe, expect, it } from 'vitest';
import { layered, validateLayout, type LayoutEngine } from '@mermaid-js/core/layout';
import { tree } from '@mermaid-js/core/layout/tree';
import { tableMeasurer } from '@mermaid-js/core/text';
import type { MindmapShape } from '../model.ts';
import { contextFor, fixtureModel, themeNamed, type FixtureNode } from './fixtures.ts';
import { mindmapProblems, treeProblems } from './invariants.ts';
import { layoutMindmap } from './layout.ts';

const SHAPES: readonly MindmapShape[] = [
  'default',
  'rect',
  'rounded',
  'circle',
  'cloud',
  'bang',
  'hexagon',
];

/** mulberry32. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['a', 'idea', 'mindmap', 'Long text that wraps over lines', '**bold**', 'x<br>y'];

function randomMindmap(n: number, seed: number): FixtureNode[] {
  const r = rng(seed);
  const out: FixtureNode[] = [{ label: 'root', shape: 'circle', depth: 0 }];
  for (let i = 1; i < n; i++) {
    const prev = out[i - 1]!.depth;
    const depth = 1 + Math.floor(r() * Math.min(prev + 1, 6));
    out.push({
      label: `${WORDS[Math.floor(r() * WORDS.length)]} ${i}`,
      shape: SHAPES[Math.floor(r() * SHAPES.length)],
      depth,
      ...(r() < 0.2 ? { icon: 'mdi:fire' } : {}),
    });
  }
  return out;
}

const FIXTURES: [string, FixtureNode[]][] = [
  ['root only', [{ label: 'root', depth: 0 }]],
  [
    'every shape, plain and with an icon',
    [
      { label: 'root', depth: 0 },
      ...SHAPES.flatMap((shape) => [
        { label: `${shape}`, shape, depth: 1 },
        { label: `${shape} icon`, shape, depth: 2, icon: 'fa fa-book' },
      ]),
    ],
  ],
  ['deep chain', Array.from({ length: 60 }, (_, i) => ({ label: `n${i}`, depth: i }))],
  [
    'wide fan',
    [
      { label: 'root', depth: 0 },
      ...Array.from({ length: 80 }, (_, i) => ({ label: `leaf ${i}`, depth: 1 })),
    ],
  ],
  [
    'repeated labels',
    [
      { label: 'a', depth: 0 },
      { label: 'a', depth: 1 },
      { label: 'a', depth: 2 },
    ],
  ],
  ...[1, 2, 3, 4, 5].map((s): [string, FixtureNode[]] => [`random ${s}`, randomMindmap(120, s)]),
];

const ENGINES: [string, LayoutEngine][] = [
  ['tree', tree],
  ['layered', layered],
];

describe.each(ENGINES)('%s over hand-built mindmaps', (name, engine) => {
  it.each(FIXTURES)('%s: valid, every shape holds its label and icon', async (_, nodes) => {
    for (const measurer of [undefined, tableMeasurer]) {
      const ctx = contextFor(engine, await themeNamed(), {}, measurer);
      const layout = layoutMindmap(fixtureModel(nodes), ctx);
      expect(validateLayout(layout.mindmap.graph, layout)).toEqual([]);
      expect(mindmapProblems(layout)).toEqual([]);
      if (name === 'tree') expect(treeProblems(layout.mindmap.graph, layout)).toEqual([]);
      expect(ctx.warnings).toEqual([]);
    }
  });

  it.each(FIXTURES)('%s: lays out the same twice', async (_, nodes) => {
    const once = async () => {
      const l = layoutMindmap(
        fixtureModel(nodes),
        contextFor(engine, await themeNamed(), {}, tableMeasurer)
      );
      return JSON.stringify({
        ...l,
        nodes: [...l.nodes],
        edges: [...l.edges],
        groups: [...l.groups],
      });
    };
    expect(await once()).toBe(await once());
  });
});

describe('mindmapProblems', () => {
  it('finds a label wider than its shape, a box that is not its outline, and a lost node', async () => {
    const ctx = contextFor(tree, await themeNamed());
    const nodes: FixtureNode[] = [
      { label: 'root', shape: 'rect', depth: 0 },
      { label: 'puff', shape: 'cloud', depth: 1 },
    ];
    const good = layoutMindmap(fixtureModel(nodes), ctx);
    const [rect, cloud] = good.mindmap.nodes;
    const bad = {
      ...good,
      nodes: new Map([...good.nodes].slice(1)),
      mindmap: {
        ...good.mindmap,
        nodes: [
          { ...rect!, label: { ...rect!.label, width: rect!.width + 1 } },
          { ...cloud!, height: cloud!.height - 1 },
        ],
      },
    };
    expect(mindmapProblems(bad)).toEqual([
      "node 'n:root': label outside its shape",
      "node 'n:root': not laid out",
      "node 'n:puff': box is not its outline's",
      "node 'n:puff': graph node differs from its view",
    ]);
  });
});
