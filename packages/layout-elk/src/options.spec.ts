// E4 #242 (D174): every `elk.*` key reaches ELK as v12 develop's adapter hands it over
// (`render.ts` `createRootElkGraph`, `buildSubgraphLayoutOptions`, `buildElkGraphFromLayoutData`),
// through `createMermaid().render()`. What reaches ELK is the graph the package hands
// `layoutSync`, recorded on its way in. Expected values are v12 develop's (render.ts:950-972,
// :420-452, the presets at :885-937), not recomputed here.
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMermaid } from 'mermaid';
import elkLayouts from './index.ts';
import type * as Sync from './sync.ts';

const handed: ElkNode[] = [];
vi.mock('./sync.ts', async (importOriginal) => {
  const real = await importOriginal<typeof Sync>();
  return {
    ...real,
    layoutSync: (graph: ElkNode, options?: Parameters<typeof real.layoutSync>[1]) => {
      handed.push(structuredClone(graph));
      return real.layoutSync(graph, options);
    },
  };
});
beforeEach(() => void (handed.length = 0));

// A group (G), an edge into it from outside (S → A), and X, which G feeds and which feeds G
// back (B → X → C): a cycle only while G is laid out as one node.
const FLOW = `flowchart TD
  S --> A
  subgraph G
    A --> B
    C
  end
  B --> X
  X --> C
`;

const yaml = (elk: Record<string, unknown>): string =>
  Object.entries(elk)
    .map(([k, v]) => `    ${k}: ${String(v)}\n`)
    .join('');

/** Renders `text` with `layout: elk` and the `elk` section `elk` set in the front matter. */
async function render(elk: Record<string, unknown> = {}, text = FLOW, layout = 'elk') {
  handed.length = 0;
  const m = createMermaid();
  m.registerLayoutLoaders(elkLayouts);
  const section = Object.keys(elk).length > 0 ? `  elk:\n${yaml(elk)}` : '';
  const result = await m.render('d', `---\nconfig:\n  layout: ${layout}\n${section}---\n${text}`);
  expect(handed).toHaveLength(1);
  return { root: handed[0]!, ...result };
}

const group = (root: ElkNode): ElkNode => root.children!.find((c) => c.id === 'G')!;
const node = (root: ElkNode, id: string): ElkNode | undefined => {
  for (const c of root.children ?? []) {
    if (c.id === id) return c;
    const inner = node(c, id);
    if (inner) return inner;
  }
  return undefined;
};
const edgesOf = (n: ElkNode): ElkExtendedEdge[] => [
  ...(n.edges ?? []),
  ...(n.children ?? []).flatMap(edgesOf),
];
const ends = (root: ElkNode): string[] =>
  edgesOf(root).map((e) => `${e.sources[0]}>${e.targets[0]}`);

describe('the `elk` section reaches ELK as in v12 develop', () => {
  it('with nothing set: the default preset and v12’s defaults, at the root and in groups', async () => {
    const { root, warnings } = await render();
    expect(warnings).toEqual([]);
    // v12 develop's root for an unconfigured diagram (as captured in fixtures/v12-elk-corpus.json).
    expect(root.layoutOptions).toMatchObject({
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.mergeEdges': 'false',
      'elk.layered.crossingMinimization.forceNodeModelOrder': 'false',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
      'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.layering.coffmanGraham.layerBound': '4',
    });
    expect(group(root).layoutOptions).toMatchObject({
      'elk.layered.mergeEdges': 'false',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
    });
  });

  // [key, value, ELK option, where v12 sets it]
  it.each([
    ['mergeEdges', true, 'elk.layered.mergeEdges', 'true', 'both'],
    ['nodePlacementStrategy', 'SIMPLE', 'elk.layered.nodePlacement.strategy', 'SIMPLE', 'both'],
    [
      'nodePlacementAlignment',
      'LEFTUP',
      'elk.layered.nodePlacement.bk.fixedAlignment',
      'LEFTUP',
      'both',
    ],
    ['layeringStrategy', 'LONGEST_PATH', 'elk.layered.layering.strategy', 'LONGEST_PATH', 'root'],
    ['layeringLayerBound', 2, 'elk.layered.layering.coffmanGraham.layerBound', '2', 'root'],
    ['cycleBreakingStrategy', 'GREEDY', 'elk.layered.cycleBreaking.strategy', 'GREEDY', 'both'],
    [
      'forceNodeModelOrder',
      true,
      'elk.layered.crossingMinimization.forceNodeModelOrder',
      'true',
      'root',
    ],
    [
      'considerModelOrder',
      'PREFER_EDGES',
      'elk.layered.considerModelOrder.strategy',
      'PREFER_EDGES',
      'root',
    ],
  ] as const)('elk.%s: %s sets %s', async (key, value, option, expected, where) => {
    const { root, warnings } = await render({ [key]: value });
    expect(warnings).toEqual([]);
    expect(root.layoutOptions?.[option]).toBe(expected);
    const inGroup = group(root).layoutOptions?.[option];
    if (where === 'both') expect(inGroup).toBe(expected);
    else expect(inGroup).toBeUndefined();
  });

  // v12 develop's ELK_PRESETS: root placement, group placement, alignment, cycle breaking.
  it.each([
    ['default', 'BRANDES_KOEPF', 'BRANDES_KOEPF', 'BALANCED', 'DEPTH_FIRST'],
    ['legacy', 'BRANDES_KOEPF', 'BRANDES_KOEPF', 'NONE', 'GREEDY'],
    ['modelOrder', 'NETWORK_SIMPLEX', 'BRANDES_KOEPF', 'NONE', 'GREEDY_MODEL_ORDER'],
    ['depthFirst', 'NETWORK_SIMPLEX', 'BRANDES_KOEPF', 'NONE', 'DEPTH_FIRST'],
  ] as const)(
    'elk.preset: %s',
    async (preset, placement, groupPlacement, alignment, cycleBreaking) => {
      const { root } = await render({ preset });
      const g = group(root).layoutOptions!;
      expect(root.layoutOptions!['elk.layered.layering.strategy']).toBe('NETWORK_SIMPLEX');
      expect(root.layoutOptions!['elk.layered.nodePlacement.strategy']).toBe(placement);
      expect(g['elk.layered.nodePlacement.strategy']).toBe(groupPlacement);
      for (const o of [root.layoutOptions!, g]) {
        expect(o['elk.layered.nodePlacement.bk.fixedAlignment']).toBe(alignment);
        expect(o['elk.layered.cycleBreaking.strategy']).toBe(cycleBreaking);
      }
    }
  );

  it('elk.cycleBreakingStrategy: MODEL_ORDER stays off a group ELK lays out with its parent', async () => {
    // elkjs 0.12 throws on MODEL_ORDER for a compound node under INCLUDE_CHILDREN (v12 develop's
    // render fails); the root's value covers that group. A group on its own keeps it.
    const { root, warnings } = await render({ cycleBreakingStrategy: 'MODEL_ORDER' });
    expect(warnings).toEqual([]);
    expect(root.layoutOptions?.['elk.layered.cycleBreaking.strategy']).toBe('MODEL_ORDER');
    expect(group(root).layoutOptions?.['elk.layered.cycleBreaking.strategy']).toBeUndefined();
    const own = await render(
      { cycleBreakingStrategy: 'MODEL_ORDER' },
      'flowchart TD\n  S --> G\n  subgraph G\n    direction LR\n    A --> B\n  end\n'
    );
    expect(group(own.root).layoutOptions?.['elk.layered.cycleBreaking.strategy']).toBe(
      'MODEL_ORDER'
    );
  });

  it('an explicit key beats the preset for that key only, an explicit NONE included', async () => {
    const { root } = await render({
      preset: 'legacy',
      nodePlacementStrategy: 'SIMPLE',
      nodePlacementAlignment: 'NONE',
    });
    for (const o of [root.layoutOptions!, group(root).layoutOptions!]) {
      expect(o['elk.layered.nodePlacement.strategy']).toBe('SIMPLE');
      expect(o['elk.layered.nodePlacement.bk.fixedAlignment']).toBe('NONE');
      expect(o['elk.layered.cycleBreaking.strategy']).toBe('GREEDY');
    }
    const alignment = await render({ nodePlacementAlignment: 'LEFTUP' });
    expect(alignment.root.layoutOptions!['elk.layered.nodePlacement.strategy']).toBe(
      'BRANDES_KOEPF'
    );
  });

  it('an unknown preset falls back to default (`__proto__` included)', async () => {
    const { root, warnings } = await render({ preset: '__proto__' });
    expect(warnings.map((w) => w.code)).toEqual([]);
    expect(root.layoutOptions!['elk.layered.nodePlacement.bk.fixedAlignment']).toBe('BALANCED');
    expect(root.layoutOptions!['elk.layered.cycleBreaking.strategy']).toBe('DEPTH_FIRST');
  });

  it('elk.keepEntryNodeOnTop pins a recursive flow’s entry to the first layer (off by default)', async () => {
    // v12 render.spec: a → b → c → a, the entry is the first declared node.
    const loop = 'flowchart TD\n  a --> b\n  b --> c\n  c --> a\n';
    const pinned = (root: ElkNode) =>
      ['a', 'b', 'c'].map(
        (id) => node(root, id)?.layoutOptions?.['elk.layered.layering.layerConstraint']
      );
    expect(pinned((await render({}, loop)).root)).toEqual([undefined, undefined, undefined]);
    expect(pinned((await render({ keepEntryNodeOnTop: true }, loop)).root)).toEqual([
      'FIRST',
      undefined,
      undefined,
    ]);
  });

  it('elk.orientFeedbackEdges hands the edge that re-enters a group over reversed (on by default)', async () => {
    // v12 subgraphFeedbackEdges.spec: X → C closes G → X → G only while G is collapsed.
    expect(ends((await render()).root)).toContain('C>X');
    const off = ends((await render({ orientFeedbackEdges: false })).root);
    expect(off).toContain('X>C');
    expect(off).not.toContain('C>X');
  });

  it('a reversed edge is still drawn from its source to its target', async () => {
    const m = createMermaid();
    m.registerLayoutLoaders(elkLayouts);
    const seen: string[] = [];
    m.registerLayoutLoaders(
      elkLayouts.map((l) => ({
        ...l,
        loader: async () => {
          const engine = await l.loader();
          return (graph, ctx) => {
            const model = engine(graph, ctx);
            const e = graph.edges.find((x) => x.source === 'X' && x.target === 'C')!;
            const route = model.edges.get(e.id)!.points;
            const x = model.nodes.get('X')!;
            const c = model.nodes.get('C')!;
            const dist = (p: { x: number; y: number }, n: typeof x) =>
              Math.hypot(p.x - n.x, p.y - n.y);
            seen.push(dist(route[0]!, x) < dist(route[0]!, c) ? 'from X' : 'from C');
            return model;
          };
        },
      }))
    );
    await m.render('d', `---\nconfig:\n  layout: elk\n---\n${FLOW}`);
    expect(seen).toEqual(['from X']);
  });
});

describe('the `elk.*` keys are known only while the plugin is registered (D153)', () => {
  const text = `---\nconfig:\n  layout: elk\n  elk:\n    mergeEdges: true\n---\nflowchart TD\n  A --> B\n`;

  it('without the plugin the section is an unknown key', async () => {
    const { warnings } = await createMermaid().render('d', text);
    expect(warnings.map((w) => w.code).sort()).toEqual(['CONFIG_UNKNOWN_KEY', 'ELK_NOT_INSTALLED']);
  });

  it('with it the keys are known, and an unknown one still warns', async () => {
    const m = createMermaid();
    m.registerLayoutLoaders(elkLayouts);
    expect((await m.render('d', text)).warnings).toEqual([]);
    const typo = await m.render('d', text.replace('mergeEdges', 'mergeEdge'));
    expect(typo.warnings.map((w) => w.code)).toEqual(['CONFIG_UNKNOWN_KEY']);
  });

  it('registering the plugin after a render makes the same text resolve again', async () => {
    const m = createMermaid();
    expect((await m.render('d', text)).warnings.map((w) => w.code)).toContain('CONFIG_UNKNOWN_KEY');
    m.registerLayoutLoaders(elkLayouts);
    expect((await m.render('d', text)).warnings).toEqual([]);
  });
});
