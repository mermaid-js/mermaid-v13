import { describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { layered, validateLayout, type LayoutGraph } from '@mermaid-js/core/layout';
import { elkEngine, takeNotes, toElkGraph, type ElkAlgorithm } from './adapter.ts';

const spacing = { node: 50, rank: 50, edge: 20 };

/** Two nodes in a titled group, one outside, a labelled edge into the group and a self loop. */
const grouped = (): LayoutGraph => ({
  direction: 'TB',
  spacing,
  diagramPadding: 8,
  nodes: [
    { id: 'A', width: 60, height: 40 },
    { id: 'B', width: 80, height: 40, parent: 'G' },
    { id: 'C', width: 40, height: 40, parent: 'G' },
  ],
  edges: [
    { id: 'e1', source: 'A', target: 'B', minLen: 1, label: { width: 30, height: 14 } },
    { id: 'e2', source: 'B', target: 'C', minLen: 1, endLabel: { width: 8, height: 10 } },
    { id: 'e3', source: 'A', target: 'G', minLen: 1 },
  ],
  groups: [
    {
      id: 'G',
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
      title: { width: 120, height: 20 },
    },
  ],
});

const chain = (direction: LayoutGraph['direction']): LayoutGraph => ({
  direction,
  spacing,
  nodes: [
    { id: 'A', width: 40, height: 20 },
    { id: 'B', width: 40, height: 20 },
  ],
  edges: [{ id: 'e', source: 'A', target: 'B', minLen: 1 }],
  groups: [],
});

const ALL: ElkAlgorithm[] = [
  'layered',
  'stress',
  'force',
  'mrtree',
  'sporeOverlap',
  'box',
  'rectpacking',
];
// ELK's stress and force place by edge length alone, so boxes may overlap (as in v12).
const MAY_OVERLAP = new Set<ElkAlgorithm>(['stress', 'force']);

describe('elkEngine (LayoutGraph → ELK → LayoutModel)', () => {
  it('lays A → B out with ELK layered: rank spacing between them, in the flow direction', () => {
    const down = elkEngine('layered')(chain('TB'));
    const a = down.nodes.get('A')!;
    const b = down.nodes.get('B')!;
    // ELK layered, not the built-in engine: boxes at the padding, ranks `spacing.rank` apart.
    expect(a).toEqual({ x: 20, y: 10, width: 40, height: 20 });
    expect(b).toEqual({ x: 20, y: 80, width: 40, height: 20 });
    expect(down).toMatchObject({ width: 40, height: 90, direction: 'TB' });
    expect(down.edges.get('e')).toEqual({
      points: [
        { x: 20, y: 20, axis: 'v' },
        { x: 20, y: 70, axis: 'v' },
      ],
      ports: { source: 'bottom', target: 'top' },
    });
  });

  it.each([
    ['BT', 'top', 'bottom'],
    ['LR', 'right', 'left'],
    ['RL', 'left', 'right'],
  ] as const)('follows direction %s', (direction, source, target) => {
    const model = elkEngine('layered')(chain(direction));
    expect(model.edges.get('e')!.ports).toEqual({ source, target });
  });

  it.each(ALL)('gives a valid model for a grouped graph with %s', (algorithm) => {
    const graph = grouped();
    const model = elkEngine(algorithm)(graph);
    const problems = validateLayout(graph, model);
    if (MAY_OVERLAP.has(algorithm))
      expect(problems.filter((p) => !p.includes('overlap'))).toEqual([]);
    else expect(problems).toEqual([]);
    expect([...model.edges.keys()]).toEqual(['e1', 'e2', 'e3']);
    const e1 = model.edges.get('e1')!;
    expect(e1.label).toBeDefined();
    expect(model.edges.get('e2')!.endLabel).toBeDefined();
    const g = model.groups.get('G')!;
    // The title sits in the top band, centred across the group.
    expect(g.title.x).toBeCloseTo(g.x);
    expect(g.title.y).toBeCloseTo(g.y - g.height / 2 + 8 / 2 + 20 / 2);
    expect(g.width).toBeGreaterThanOrEqual(120 + 16);
  });

  it('lays out the same graph to the same model every time (no $H, R-API-2)', () => {
    const first = elkEngine('layered')(grouped());
    expect(elkEngine('layered')(grouped())).toEqual(first);
    expect(JSON.stringify([...first.nodes, ...first.edges, ...first.groups])).not.toContain('$H');
  });

  it('elk.radial lays out a tree; a graph that is not one falls back to layered, noted once', () => {
    const tree = chain('TB');
    const config = {} as ResolvedConfig;
    expect(validateLayout(tree, elkEngine('radial')(tree, { config }))).toEqual([]);
    expect(takeNotes(config)).toEqual([]);
    // Not a tree for ELK ("The given graph is not a tree!"): core's layered, and a note.
    const graph = grouped();
    expect(elkEngine('radial')(graph, { config })).toEqual(layered(graph));
    elkEngine('radial')(graph, { config });
    expect(takeNotes(config).map((n) => n.code)).toEqual(['ELK_RADIAL_NOT_A_TREE']);
    expect(takeNotes(config)).toEqual([]);
  });

  describe('groups (v12 `buildSubgraphLayoutOptions`, `configureCrossHierarchyEdges`)', () => {
    const pad = { top: 8, right: 8, bottom: 8, left: 8 };
    /** TB outside, a group of two running LR inside, and `X`, joined to the group or into it. */
    const sideways = (into: 'G' | 'a'): LayoutGraph => ({
      direction: 'TB',
      spacing,
      nodes: [
        { id: 'X', width: 40, height: 20 },
        { id: 'a', width: 40, height: 20, parent: 'G' },
        { id: 'b', width: 40, height: 20, parent: 'G' },
      ],
      edges: [
        { id: 'in', source: 'X', target: into, minLen: 1 },
        { id: 'ab', source: 'a', target: 'b', minLen: 1 },
      ],
      groups: [{ id: 'G', padding: pad, direction: 'LR' }],
    });

    it('lays a group out on its own in its own direction', () => {
      const graph = sideways('G');
      const model = elkEngine('layered')(graph);
      expect(validateLayout(graph, model)).toEqual([]);
      const a = model.nodes.get('a')!;
      const b = model.nodes.get('b')!;
      expect(b.y).toBe(a.y);
      expect(b.x).toBeGreaterThan(a.x);
      expect(model.edges.get('ab')!.ports).toEqual({ source: 'right', target: 'left' });
    });

    it('puts a group an edge crosses back into its parent’s layout and direction', () => {
      const graph = sideways('a');
      const built = toElkGraph(graph, 'layered');
      expect(built.nodes.get('G')!.layoutOptions).toMatchObject({
        'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
        'elk.direction': 'DOWN',
      });
      const model = elkEngine('layered')(graph);
      expect(validateLayout(graph, model)).toEqual([]);
      expect(model.nodes.get('b')!.y).toBeGreaterThan(model.nodes.get('a')!.y);
    });

    it('also puts the edge’s common ancestor back, and leaves groups above it alone', () => {
      const graph: LayoutGraph = {
        direction: 'TB',
        spacing,
        nodes: [
          { id: 'a', width: 40, height: 20, parent: 'Inner' },
          { id: 'b', width: 40, height: 20, parent: 'Mid' },
        ],
        edges: [{ id: 'ab', source: 'a', target: 'b', minLen: 1 }],
        groups: [
          { id: 'Top', padding: pad, direction: 'RL' },
          { id: 'Mid', parent: 'Top', padding: pad, direction: 'LR' },
          { id: 'Inner', parent: 'Mid', padding: pad, direction: 'BT' },
        ],
      };
      const { nodes } = toElkGraph(graph, 'layered');
      const handling = (id: string) => nodes.get(id)!.layoutOptions!['elk.hierarchyHandling'];
      expect([handling('Top'), handling('Mid'), handling('Inner')]).toEqual([
        'SEPARATE_CHILDREN',
        'INCLUDE_CHILDREN',
        'INCLUDE_CHILDREN',
      ]);
      // Mid and Inner run in Top's direction, inside Top's own layout.
      expect(nodes.get('Inner')!.layoutOptions!['elk.direction']).toBe('LEFT');
      expect(nodes.get('Mid')!.edges!.map((e) => e.id)).toEqual(['ab']);
      const model = elkEngine('layered')(graph);
      expect(validateLayout(graph, model)).toEqual([]);
    });

    it('keeps an edge between a group and its own member inside the group', () => {
      const graph = sideways('G');
      graph.edges.push({ id: 'Ga', source: 'G', target: 'a', minLen: 1 });
      const { nodes, root } = toElkGraph(graph, 'layered');
      expect(nodes.get('G')!.edges!.map((e) => e.id)).toEqual(['ab', 'Ga']);
      expect(root.edges!.map((e) => e.id)).toEqual(['in']);
    });

    it('reserves a titled group’s width before layout', () => {
      const { nodes } = toElkGraph(grouped(), 'layered');
      expect(nodes.get('G')!.layoutOptions).toMatchObject({
        'elk.nodeSize.constraints': '[MINIMUM_SIZE]',
        'elk.nodeSize.minimum': '(136, 0)',
        'elk.padding': '[top=28,left=8,bottom=8,right=8]',
      });
    });

    it('carries a group’s `algorithm` but does not apply it (D174)', () => {
      const graph = grouped();
      const picked = grouped();
      picked.groups[0]!.algorithm = 'elk.box';
      expect(elkEngine('layered')(picked)).toEqual(elkEngine('layered')(graph));
    });
  });

  describe('edges', () => {
    it('hands ELK an edge from inside a group before the one from its border (v12 order)', () => {
      const graph: LayoutGraph = {
        direction: 'TB',
        spacing,
        nodes: [
          { id: 'a', width: 40, height: 20 },
          { id: 'da', width: 40, height: 20, parent: 'outer' },
        ],
        edges: [
          { id: 'border', source: 'outer', target: 'a', minLen: 1 },
          { id: 'inner', source: 'da', target: 'a', minLen: 1 },
        ],
        groups: [{ id: 'outer', padding: { top: 8, right: 8, bottom: 8, left: 8 } }],
      };
      expect(toElkGraph(graph, 'layered').root.edges!.map((e) => e.id)).toEqual([
        'inner',
        'border',
      ]);
      expect([...elkEngine('layered')(graph).edges.keys()]).toEqual(['border', 'inner']);
    });

    it('makes an end label clear its end’s marker, and reads its centre back', () => {
      const graph = chain('TB');
      graph.edges[0] = {
        ...graph.edges[0]!,
        startLabel: { width: 8, height: 10 },
        endLabel: { width: 6, height: 10 },
        endMarker: { length: 20, width: 12 },
      };
      const built = toElkGraph(graph, 'layered');
      const sizes = built.edges.get('e')!.labels!.map((l) => [l.width, l.height]);
      expect(sizes).toEqual([
        [8, 10],
        [18, 22],
      ]);
      const model = elkEngine('layered')(graph);
      expect(validateLayout(graph, model)).toEqual([]);
    });

    it('sets v12’s fixed options on the root and on every group', () => {
      const { root, nodes } = toElkGraph(grouped(), 'layered');
      expect(root.layoutOptions).toMatchObject({
        'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
        'elk.layered.unnecessaryBendpoints': 'true',
        'elk.layered.mergeHierarchyEdges': 'true',
        'elk.layered.edgeRouting.selfLoopDistribution': 'EQUALLY',
        'elk.spacing.portsSurrounding': '[top=12,left=12,bottom=12,right=12]',
      });
      expect(nodes.get('G')!.layoutOptions).toMatchObject({
        'elk.layered.nodePlacement.networkSimplex.nodeFlexibility': 'PORT_POSITION',
        'elk.spacing.portsSurrounding': '[top=12,left=12,bottom=12,right=12]',
      });
    });
  });
});
