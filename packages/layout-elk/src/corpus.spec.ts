import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  layered,
  validateLayout,
  type LayoutContext,
  type LayoutGraph,
  type LayoutModel,
} from '@mermaid-js/core/layout';
import { createMermaid } from 'mermaid';
import corpus from '../fixtures/v12-elk-corpus.json' with { type: 'json' };
import { toElkGraph, type ElkAlgorithm } from './adapter.ts';
import elkLayouts from './index.ts';
import { elkConfigOf } from './options.ts';
import { findCommonAncestor, ROOT, type Tree } from './tree.ts';

// The ELK corpus (every e2e/diagrams source that selects ELK, `fixtures/v12-elk-corpus.json`)
// for the four graph types v13 has: parsed and measured by v13 through `createMermaid().render()`,
// laid out by the package's own engines, the ones `registerLayoutLoaders(elkLayouts)` installs.
// The fixture also holds the graph v12 develop's adapter handed ELK for the same source.

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const TYPES = ['flowchart', 'class-diagram', 'state-diagram-v2', 'er-diagram'];
const entries = (corpus as unknown as { source: string; input: ElkNode }[]).filter((c) =>
  TYPES.some((t) => c.source.startsWith(`e2e/diagrams/${t}/`))
);
const sources = entries.map((e) => e.source);

/**
 * The source as written. The two class sources hold `&lt;&lt;interface&gt;&gt;`, which v12's
 * Cypress decoded as HTML before rendering; the v12 capture did the same.
 */
const text = (source: string): string =>
  readFileSync(REPO + source, 'utf8')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');

interface Laid {
  graph: LayoutGraph;
  model: LayoutModel;
  ctx?: LayoutContext;
}

/** A fresh API with the package registered, recording what each ELK engine call gets and gives. */
function api(laid: Laid[] = []) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  m.registerLayoutLoaders(
    elkLayouts.map((l) => ({
      ...l,
      loader: async () => {
        const engine = await l.loader();
        return (graph: LayoutGraph, ctx?: LayoutContext) => {
          const model = engine(graph, ctx);
          laid.push({ graph, model, ...(ctx ? { ctx } : {}) });
          return model;
        };
      },
    }))
  );
  return m;
}

const rendered = new Map<string, { laid: Laid[]; svg: string }>();

beforeAll(async () => {
  for (const source of sources) {
    const laid: Laid[] = [];
    const { svg } = await api(laid).render('d', text(source));
    rendered.set(source, { laid, svg });
  }
}, 120_000);

describe('ELK over parser-produced graphs (DDLT)', () => {
  it('covers flowchart, class, state and ER', () => {
    for (const t of TYPES)
      expect(
        sources.some((s) => s.includes(`/${t}/`)),
        t
      ).toBe(true);
  });

  it.each(sources)('%s: no NaN, overlaps or stray labels; groups hold their members', (source) => {
    const { laid } = rendered.get(source)!;
    expect(laid.length).toBeGreaterThan(0);
    for (const { graph, model } of laid) expect(validateLayout(graph, model)).toEqual([]);
  });
});

describe('what reaches the engine', () => {
  it('passes the resolved config and a group’s `@{ algorithm }` (D174: not applied yet)', async () => {
    const seen: { graph: LayoutGraph; ctx?: LayoutContext }[] = [];
    const m = createMermaid();
    m.registerLayoutLoaders([
      {
        name: 'elk',
        loader: async () => (graph, ctx) => (seen.push({ graph, ctx }), layered(graph)),
      },
    ]);
    const source =
      'e2e/diagrams/flowchart/nightly-check/elk-container-algorithms/elk-subgraph-with-box-algorithm.mmd';
    await m.render('d', text(source));
    expect(seen[0]!.graph.groups).toMatchObject([{ id: 'grp', algorithm: 'elk.box' }]);
    expect(seen[0]!.ctx?.config?.layout).toBe('elk');
  });
});

describe('ELK output is deterministic (R-ARCH-6)', () => {
  it.each(sources)('%s: a fresh API draws the same bytes', async (source) => {
    const again = await api().render('d', text(source));
    expect(again.svg).toBe(rendered.get(source)!.svg);
  });

  it.each(sources)('%s: renderSync after prepare equals render()', async (source) => {
    const m = api();
    await m.prepare(text(source));
    expect(m.renderSync(text(source), { id: 'd' }).svg).toBe(rendered.get(source)!.svg);
  });
});

// ── The graph handed to ELK, against v12 develop's for the same source ──────────────────────
//
// Sizes differ (v13 measures with its own measurer and padding) and so do ids, so what is
// compared is the shape: which group holds what, which groups ELK lays out on their own and in
// which direction, the edges each container holds and their order, the edge label kinds, the
// fixed options v12 sets whatever the config, and what the `elk.*` keys and the preset set (E4):
// the root's and every group's options and the nodes `keepEntryNodeOnTop` pins.

/** v13 ids carry a kind prefix (`n:`, `c:`); v12 ER ids are `entity-NAME-N`. */
const v13Id = (id: string): string => id.replace(/^[a-z]:/, '');
const v12Id = (id: string): string => id.replace(/^entity-(.*)-\d+$/, '$1');

const opt = (o: Record<string, unknown> | undefined, key: string): string | undefined => {
  const v = o?.[`elk.${key}`] ?? o?.[key];
  return v === undefined ? undefined : String(v as string | number | boolean);
};

/** The fixed (config-independent) options v12 develop sets on the root and on every group. */
const ROOT_FIXED = [
  'layered.unnecessaryBendpoints',
  'layered.wrapping.multiEdge.improveCuts',
  'layered.wrapping.multiEdge.improveWrappedEdges',
  'layered.edgeRouting.selfLoopDistribution',
  'layered.mergeHierarchyEdges',
  'spacing.portsSurrounding',
];
const GROUP_FIXED = [
  'layered.nodePlacement.networkSimplex.nodeFlexibility',
  'spacing.portsSurrounding',
];
/** What the `elk.*` keys and the preset set on the root (v12 `createRootElkGraph`). */
const ROOT_CONFIG = [
  'layered.nodePlacement.strategy',
  'layered.nodePlacement.bk.fixedAlignment',
  'layered.mergeEdges',
  'layered.crossingMinimization.forceNodeModelOrder',
  'layered.considerModelOrder.strategy',
  'layered.cycleBreaking.strategy',
  'layered.layering.strategy',
  'layered.layering.coffmanGraham.layerBound',
];
/** ... and on every group (v12 `buildSubgraphLayoutOptions`). */
const GROUP_CONFIG = [
  'layered.mergeEdges',
  'layered.nodePlacement.bk.fixedAlignment',
  'layered.nodePlacement.strategy',
  'layered.cycleBreaking.strategy',
];

interface Shape {
  root: Record<string, string | undefined>;
  /** Group id → its parent, how ELK lays it out, its direction when on its own, fixed options. */
  groups: Record<string, string>;
  /** Container id → its edges in order, `source>target:label kinds`. */
  edges: Record<string, string[]>;
  /** Nodes pinned to a layer (`keepEntryNodeOnTop`), `id=constraint`. */
  pinned: string[];
}

function shape(root: ElkNode, rename: (id: string) => string, edgeList: ElkExtendedEdge[]): Shape {
  const tree = new Map<string, string>();
  const groups: Record<string, string> = {};
  const pinned: string[] = [];
  const handling = new Map<string, string>();
  handling.set(ROOT, opt(root.layoutOptions, 'hierarchyHandling') ?? 'SEPARATE_CHILDREN');
  const walk = (n: ElkNode, parent: string): void => {
    for (const c of n.children ?? []) {
      const id = rename(c.id);
      if (parent !== ROOT) tree.set(id, parent);
      const layer = opt(c.layoutOptions, 'layered.layering.layerConstraint');
      if (layer) pinned.push(`${id}=${layer}`);
      if (!c.children?.length) continue;
      // v12 lays out a group with `@{ algorithm }` on its own with that algorithm; v13 parses the
      // key but does not apply it (D174), so the group keeps the handling it would have had.
      const picked = (c as { metadata?: { algorithm?: unknown } }).metadata?.algorithm;
      const own = picked === undefined ? opt(c.layoutOptions, 'hierarchyHandling') : undefined;
      handling.set(id, own && own !== 'INHERIT' ? own : handling.get(parent)!);
      const separate = handling.get(id) === 'SEPARATE_CHILDREN';
      groups[id] = [
        `in ${parent || 'root'}`,
        handling.get(id),
        separate ? opt(c.layoutOptions, 'direction') : '',
        ...GROUP_FIXED.map((k) => `${k}=${opt(c.layoutOptions, k)}`),
        // A group v12 lays out with its own `@{ algorithm }` drops none of these.
        ...GROUP_CONFIG.map((k) => `${k}=${opt(c.layoutOptions, k)}`),
      ].join(' ');
      walk(c, id);
    }
  };
  walk(root, ROOT);
  const edges: Record<string, string[]> = {};
  for (const e of edgeList) {
    let [source, target] = [rename(e.sources[0]!), rename(e.targets[0]!)];
    // v12's orientFeedbackEdges (E4) hands some edges over reversed.
    if ((e as { layoutReversed?: boolean }).layoutReversed) [source, target] = [target, source];
    const kinds = (e.labels ?? [])
      .filter((l) => (l.width ?? 0) > 0)
      .map((l) => opt(l.layoutOptions, 'edgeLabels.placement'))
      .join(',');
    const home = findCommonAncestor(source, target, tree as Tree) || 'root';
    (edges[home] ??= []).push(`${source}>${target}:${kinds}`);
  }
  const rootOptions = Object.fromEntries(
    ['hierarchyHandling', ...ROOT_FIXED, ...ROOT_CONFIG].map((k) => [k, opt(root.layoutOptions, k)])
  );
  return { root: rootOptions, groups, edges, pinned: pinned.sort() };
}

/** Every edge of the built ELK graph, container by container, in the order ELK gets them. */
function allEdges(n: ElkNode): ElkExtendedEdge[] {
  return [...(n.edges ?? []), ...(n.children ?? []).flatMap(allEdges)];
}

/** Sources whose v13 graph differs from v12's before the adapter sees it. */
const OTHER_GRAPH: Record<string, string> = {
  'e2e/diagrams/state-diagram-v2/nightly-check/elk/elk-notes-keep-their-layout.mmd':
    'v12 puts a state and its note in a group of their own; v13’s state graph has no such group',
};

describe('the ELK graph matches v12 develop’s in shape', () => {
  it('names only corpus sources as exceptions', () => {
    for (const source of Object.keys(OTHER_GRAPH)) expect(sources).toContain(source);
  });

  const compared = entries.filter((e) => !(e.source in OTHER_GRAPH));
  it.each(compared.map((e) => [e.source, e.input] as const))('%s', (source, v12) => {
    const { graph, ctx } = rendered.get(source)!.laid[0]!;
    const algorithm = String(v12.layoutOptions!['elk.algorithm']).replace(
      /^elk\./,
      ''
    ) as ElkAlgorithm;
    // The `elk` section the engine got: fragment defaults plus whatever the source sets.
    const built = toElkGraph(graph, algorithm, elkConfigOf(ctx?.config)).root;
    expect(shape(built, v13Id, allEdges(built))).toEqual(shape(v12, v12Id, v12.edges ?? []));
  });
});
