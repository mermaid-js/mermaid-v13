// The v12 develop ELK unit specs (`rendering-util/layout-algorithms/elk/__tests__`) for what E4
// #242 ports: presets, the `elk.*` options of the root and of groups, `keepEntryNodeOnTop`,
// `orientFeedbackEdges` and `straightenEdges`. Cases are v12's, with v12's inputs and expected
// values; v12's LayoutData inputs become LayoutGraphs. The skipped v12 cases, each with its
// reason, are listed in v13/docs/agents/runs/215/tickets/242.md.
import { describe, expect, it } from 'vitest';
import type { LayoutGraph, Point as P } from '@mermaid-js/core/layout';
import { elkEngine, toElkGraph } from './adapter.ts';
import { groupOptions, resolveElkPreset } from './options.ts';
import { findCyclicEntryNodes, findSubgraphFeedbackEdges } from './passes.ts';
import {
  projectLabelOntoStraightenedRun,
  straightenEdgeTerminals,
  straightenTerminalJogs,
} from './straighten.ts';

// ── render.spec.ts › buildSubgraphLayoutOptions (the `elk.*` part) ───────────────────────────
describe('buildSubgraphLayoutOptions', () => {
  const o = (elk: Parameters<typeof groupOptions>[0]) => groupOptions(elk);

  it('propagates mergeEdges to subgraphs without an explicit direction', () => {
    expect(o({ mergeEdges: true })['elk.layered.mergeEdges']).toBe('true');
  });

  it('propagates mergeEdges to subgraphs with an explicit direction', () => {
    const g: LayoutGraph = {
      direction: 'TB',
      spacing: { node: 50, rank: 50, edge: 20 },
      nodes: [{ id: 'a', width: 10, height: 10, parent: 'G' }],
      edges: [],
      groups: [{ id: 'G', direction: 'LR', padding: { top: 8, right: 8, bottom: 8, left: 8 } }],
    };
    const opts = toElkGraph(g, 'layered', { mergeEdges: true }).nodes.get('G')!.layoutOptions!;
    expect(opts['elk.layered.mergeEdges']).toBe('true');
    expect(opts['elk.direction']).toBe('RIGHT');
    expect(opts['elk.algorithm']).toBe('layered');
    expect(opts['elk.hierarchyHandling']).toBe('SEPARATE_CHILDREN');
  });

  it('passes through nodePlacementStrategy from config', () => {
    expect(
      o({ nodePlacementStrategy: 'BRANDES_KOEPF' })['elk.layered.nodePlacement.strategy']
    ).toBe('BRANDES_KOEPF');
  });

  it('defaults nodePlacementAlignment to BALANCED', () => {
    expect(o({ mergeEdges: true })['elk.layered.nodePlacement.bk.fixedAlignment']).toBe('BALANCED');
  });

  it('passes through nodePlacementAlignment from config', () => {
    expect(
      o({ nodePlacementAlignment: 'BALANCED' })['elk.layered.nodePlacement.bk.fixedAlignment']
    ).toBe('BALANCED');
  });

  it('handles undefined elkConfig gracefully', () => {
    const opts = o({});
    expect(opts['elk.layered.mergeEdges']).toBeUndefined();
    expect(opts['elk.layered.nodePlacement.strategy']).toBe('BRANDES_KOEPF');
    expect(opts['elk.layered.nodePlacement.bk.fixedAlignment']).toBe('BALANCED');
  });

  it('lets an explicit strategy beat the preset', () => {
    expect(
      o({ preset: 'legacy', nodePlacementStrategy: 'SIMPLE' })['elk.layered.nodePlacement.strategy']
    ).toBe('SIMPLE');
  });

  it('takes the cycle breaking strategy from the named preset', () => {
    const breaking = (preset?: string) =>
      o(preset ? { preset } : {})['elk.layered.cycleBreaking.strategy'];
    expect(breaking()).toBe('DEPTH_FIRST');
    expect(breaking('default')).toBe('DEPTH_FIRST');
    expect(breaking('modelOrder')).toBe('GREEDY_MODEL_ORDER');
    expect(breaking('legacy')).toBe('GREEDY');
  });

  it('lets an explicit cycleBreakingStrategy beat the preset in a container', () => {
    expect(
      o({ preset: 'legacy', cycleBreakingStrategy: 'MODEL_ORDER' })[
        'elk.layered.cycleBreaking.strategy'
      ]
    ).toBe('MODEL_ORDER');
  });

  it('resolves container cycle breaking to the same value as the root', () => {
    for (const preset of ['default', 'legacy', 'modelOrder', 'depthFirst'])
      expect(o({ preset })['elk.layered.cycleBreaking.strategy']).toBe(
        resolveElkPreset(preset).cycleBreaking
      );
  });

  it('takes the container placement strategy from the named preset', () => {
    const placement = (preset: string) => o({ preset })['elk.layered.nodePlacement.strategy'];
    expect(placement('legacy')).toBe('BRANDES_KOEPF');
    expect(placement('depthFirst')).toBe('BRANDES_KOEPF');
    expect(placement('default')).toBe('BRANDES_KOEPF');
  });

  it('names the placement option once, fully qualified', () => {
    const opts = o({ nodePlacementStrategy: 'SIMPLE' });
    expect(opts).not.toHaveProperty(['nodePlacement.strategy']);
    expect(opts['elk.layered.nodePlacement.strategy']).toBe('SIMPLE');
  });
});

// ── render.spec.ts › findCyclicEntryNodes ───────────────────────────────────────────────────
describe('findCyclicEntryNodes', () => {
  const e = (...pairs: [string, string][]) => pairs.map(([source, target]) => ({ source, target }));

  it('returns nothing for an acyclic flow (natural source exists)', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(findCyclicEntryNodes(nodes, e(['a', 'b'], ['b', 'c'])).size).toBe(0);
  });

  it('nominates the first-declared node of a source-less cycle', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect([...findCyclicEntryNodes(nodes, e(['a', 'b'], ['b', 'c'], ['c', 'a']))]).toEqual(['a']);
  });

  it('pins the entry of a recursive flow (reported recursion case)', () => {
    const nodes = [
      'brief',
      'web',
      'academic',
      'expert',
      'synthesize',
      'format_output',
      'decision',
      'format_output2',
    ].map((id) => ({ id, parent: 'research' }));
    const entries = findCyclicEntryNodes(
      nodes,
      e(
        ['brief', 'web'],
        ['web', 'academic'],
        ['academic', 'expert'],
        ['expert', 'synthesize'],
        ['synthesize', 'decision'],
        ['decision', 'format_output2'],
        ['decision', 'brief']
      )
    );
    expect(entries.has('brief')).toBe(true);
    expect(entries.has('format_output')).toBe(false);
    expect(entries.size).toBe(1);
  });

  it('pins the true entry when a back-edge feeds it and it is not declared first (#79)', () => {
    const nodes = [
      'san_francisco',
      'stockholm',
      'new_york',
      'decide',
      'end_decision',
      'format_json',
    ].map((id) => ({ id, parent: 'world-clock' }));
    const edges = e(
      ['stockholm', 'new_york'],
      ['new_york', 'san_francisco'],
      ['san_francisco', 'decide'],
      ['decide', 'end_decision'],
      ['end_decision', 'format_json'],
      ['end_decision', 'stockholm']
    );
    expect([...findCyclicEntryNodes(nodes, edges)]).toEqual(['stockholm']);
  });

  it('scopes detection per container (parentId)', () => {
    const nodes = [
      { id: 'root_a' },
      { id: 'root_b' },
      { id: 'x', parent: 'sub' },
      { id: 'y', parent: 'sub' },
    ];
    const edges = e(['root_a', 'root_b'], ['x', 'y'], ['y', 'x']);
    expect([...findCyclicEntryNodes(nodes, edges)]).toEqual(['x']);
  });

  it('ignores self-loops when deciding whether a node is a source', () => {
    expect(findCyclicEntryNodes([{ id: 'a' }, { id: 'b' }], e(['a', 'a'], ['a', 'b'])).size).toBe(
      0
    );
  });
});

// ── render.spec.ts › buildElkGraphFromLayoutData (the `elk.*` part) ─────────────────────────
describe('buildElkGraphFromLayoutData', () => {
  const recursive = (): LayoutGraph => ({
    direction: 'TB',
    spacing: { node: 50, rank: 50, edge: 20 },
    nodes: ['a', 'b', 'c'].map((id) => ({ id, width: 50, height: 20 })),
    edges: [
      { id: 'e1', source: 'a', target: 'b', minLen: 1 },
      { id: 'e2', source: 'b', target: 'c', minLen: 1 },
      { id: 'e3', source: 'c', target: 'a', minLen: 1 },
    ],
    groups: [],
  });
  const constraint = (elk: object, id: string) =>
    toElkGraph(recursive(), 'layered', elk).nodes.get(id)!.layoutOptions?.[
      'elk.layered.layering.layerConstraint'
    ];

  it('passes through nodePlacementAlignment to the root graph', () => {
    const root = toElkGraph(recursive(), 'layered', { nodePlacementAlignment: 'BALANCED' }).root;
    expect(root.layoutOptions!['elk.layered.nodePlacement.bk.fixedAlignment']).toBe('BALANCED');
  });

  it('pins the cyclic entry node to the first layer when keepEntryNodeOnTop is enabled', () => {
    expect(constraint({ keepEntryNodeOnTop: true }, 'a')).toBe('FIRST');
    expect(constraint({ keepEntryNodeOnTop: true }, 'b')).toBeUndefined();
    expect(constraint({ keepEntryNodeOnTop: true }, 'c')).toBeUndefined();
  });

  it('does not constrain any node when keepEntryNodeOnTop is disabled (default)', () => {
    for (const id of ['a', 'b', 'c']) expect(constraint({}, id)).toBeUndefined();
  });
});

// ── render.spec.ts › resolveElkPreset ───────────────────────────────────────────────────────
describe('resolveElkPreset', () => {
  it('breaks cycles depth first by default', () => {
    expect(resolveElkPreset(undefined).cycleBreaking).toBe('DEPTH_FIRST');
    expect(resolveElkPreset('default').cycleBreaking).toBe('DEPTH_FIRST');
    expect(resolveElkPreset('modelOrder').cycleBreaking).toBe('GREEDY_MODEL_ORDER');
    expect(resolveElkPreset('legacy').cycleBreaking).toBe('GREEDY');
  });

  it('preserves depthFirst and modelOrder placement independently of default', () => {
    for (const name of ['depthFirst', 'modelOrder'])
      expect(resolveElkPreset(name)).toMatchObject({
        layering: 'NETWORK_SIMPLEX',
        placement: 'NETWORK_SIMPLEX',
        containerPlacement: 'BRANDES_KOEPF',
        alignment: 'NONE',
      });
  });

  it('falls back to default for an unknown name, including __proto__', () => {
    expect(resolveElkPreset('nope')).toEqual(resolveElkPreset('default'));
    expect(resolveElkPreset('__proto__')).toEqual(resolveElkPreset('default'));
  });
});

// ── subgraphFeedbackEdges.spec.ts ───────────────────────────────────────────────────────────
describe('findSubgraphFeedbackEdges', () => {
  const tree = (parents: Record<string, string>) => new Map(Object.entries(parents));
  const edges = (...pairs: [string, string][]) =>
    pairs.map(([source, target]) => ({ source, target }));

  it('flags the edge that re-enters a subgraph from a node fed by it', () => {
    const flags = findSubgraphFeedbackEdges(
      edges(['S', 'A'], ['A', 'B'], ['B', 'X'], ['X', 'C']),
      tree({ A: 'G', B: 'G', C: 'G' })
    );
    expect(flags).toEqual([false, false, false, true]);
  });

  it('leaves a cycle between plain nodes to ELK', () => {
    expect(findSubgraphFeedbackEdges(edges(['A', 'B'], ['B', 'C'], ['C', 'A']), tree({}))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('leaves a cycle inside one subgraph to ELK', () => {
    expect(
      findSubgraphFeedbackEdges(edges(['A', 'B'], ['B', 'A']), tree({ A: 'G', B: 'G' }))
    ).toEqual([false, false]);
  });

  it('flags nothing when the collapsed graph is acyclic', () => {
    const flags = findSubgraphFeedbackEdges(
      edges(['S', 'A'], ['A', 'B'], ['B', 'X'], ['S', 'C']),
      tree({ A: 'G', B: 'G', C: 'G' })
    );
    expect(flags).toEqual([false, false, false, false]);
  });

  it('looks at each edge on the graph of its lowest common subgraph', () => {
    const flags = findSubgraphFeedbackEdges(
      edges(['S', 'A'], ['A', 'Y'], ['Y', 'B']),
      tree({ A: 'G', B: 'G', G: 'OUTER', Y: 'OUTER' })
    );
    expect(flags).toEqual([false, false, true]);
  });

  it('ignores edges between a subgraph and its own members, and self loops', () => {
    expect(
      findSubgraphFeedbackEdges(edges(['G', 'A'], ['A', 'G'], ['A', 'A']), tree({ A: 'G' }))
    ).toEqual([false, false, false]);
  });

  it('leaves a cycle through a subgraph to ELK when a plain edge closes it', () => {
    const flags = findSubgraphFeedbackEdges(
      edges(['S', 'X'], ['X', 'B'], ['A', 'Y'], ['Y', 'X']),
      tree({ A: 'G', B: 'G' })
    );
    expect(flags).toEqual([false, false, false, false]);
  });

  it('keeps the earlier-declared direction when two subgraphs feed each other', () => {
    const flags = findSubgraphFeedbackEdges(
      edges(['A', 'C'], ['D', 'B']),
      tree({ A: 'G', B: 'G', C: 'H', D: 'H' })
    );
    expect(flags).toEqual([false, true]);
  });
});

// ── geometry.spec.ts › straightenTerminalJogs ───────────────────────────────────────────────
describe('straightenTerminalJogs', () => {
  it('moves the channel onto the port row, leaving the port alone', () => {
    const pts: P[] = [
      { x: 193, y: 116.25 },
      { x: 218, y: 116.25 },
      { x: 218, y: 119.5 },
      { x: 400, y: 119.5 },
      { x: 400, y: 300 },
    ];
    expect(straightenTerminalJogs(pts)).toEqual([
      { x: 193, y: 116.25 },
      { x: 400, y: 116.25 },
      { x: 400, y: 300 },
    ]);
  });

  it('moves a whole multi-segment run, not just its first leg', () => {
    const pts: P[] = [
      { x: 193, y: 116.25 },
      { x: 218, y: 116.25 },
      { x: 218, y: 119.5 },
      { x: 300, y: 119.5 },
      { x: 400, y: 119.5 },
      { x: 400, y: 300 },
    ];
    expect(straightenTerminalJogs(pts)).toEqual([
      { x: 193, y: 116.25 },
      { x: 300, y: 116.25 },
      { x: 400, y: 116.25 },
      { x: 400, y: 300 },
    ]);
  });

  it('handles a sub-pixel step', () => {
    const pts: P[] = [
      { x: 193, y: 116.5 },
      { x: 218, y: 116.5 },
      { x: 218, y: 117.358 },
      { x: 400, y: 117.358 },
      { x: 400, y: 300 },
    ];
    expect(straightenTerminalJogs(pts)).toEqual([
      { x: 193, y: 116.5 },
      { x: 400, y: 116.5 },
      { x: 400, y: 300 },
    ]);
  });

  it.each([
    [
      'refuses when the run ends at the far port',
      [
        [193, 116.25],
        [218, 116.25],
        [218, 119.5],
        [300, 119.5],
        [400, 119.5],
      ],
    ],
    [
      'leaves a step too large to be a port connector',
      [
        [193, 100],
        [218, 100],
        [218, 140],
        [400, 140],
        [400, 300],
      ],
    ],
    [
      'leaves a step that turns too far from the node',
      [
        [193, 116.25],
        [313, 116.25],
        [313, 119.5],
        [415, 119.5],
        [415, 300],
      ],
    ],
    [
      'leaves a step that reverses direction',
      [
        [193, 116],
        [218, 116],
        [218, 119],
        [100, 119],
        [100, 300],
      ],
    ],
    [
      'leaves a route with nothing to collapse',
      [
        [193, 120],
        [315, 120],
      ],
    ],
  ])('%s', (_name, raw) => {
    const pts = raw.map(([x, y]) => ({ x: x!, y: y! }));
    expect(straightenTerminalJogs(pts)).toEqual(pts);
  });
});

// ── render.spec.ts › straightenEdgeTerminals label projection (#8292) ───────────────────────
describe('straightenEdgeTerminals label projection (#8292)', () => {
  const pts: P[] = [
    { x: 193, y: 116.25 },
    { x: 218, y: 116.25 },
    { x: 218, y: 119.5 },
    { x: 300, y: 119.5 },
    { x: 400, y: 119.5 },
    { x: 400, y: 300 },
  ];

  it('straightens the edge and reports the run that moved', () => {
    const edge = { id: 'e1', points: pts, x: 300, y: 119.5 };
    expect(straightenEdgeTerminals([edge])).toEqual([
      {
        edge,
        runs: [
          {
            old: { a: { x: 218, y: 119.5 }, b: { x: 400, y: 119.5 } },
            new: { a: { x: 218, y: 116.25 }, b: { x: 400, y: 116.25 } },
          },
        ],
      },
    ]);
    expect(edge.points).toEqual([
      { x: 193, y: 116.25 },
      { x: 300, y: 116.25 },
      { x: 400, y: 116.25 },
      { x: 400, y: 300 },
    ]);
  });

  it('projects a label sitting on the moved run onto the new route', () => {
    const { runs } = straightenEdgeTerminals([{ id: 'e1', points: pts, x: 300, y: 119.5 }])[0]!;
    expect(projectLabelOntoStraightenedRun({ x: 300, y: 119.5 }, runs)).toEqual({
      x: 300,
      y: 116.25,
    });
  });

  it('projects onto the moved run even when an unchanged segment sits nearer to the old label position', () => {
    const withReturnLeg: P[] = [...pts, { x: 350, y: 300 }, { x: 250, y: 118 }, { x: 350, y: 118 }];
    const edge = { id: 'e1', points: withReturnLeg, x: 300, y: 119.5 };
    const { runs } = straightenEdgeTerminals([edge])[0]!;
    expect(edge.points.slice(-2)).toEqual([
      { x: 250, y: 118 },
      { x: 350, y: 118 },
    ]);
    expect(projectLabelOntoStraightenedRun({ x: 300, y: 119.5 }, runs)).toEqual({
      x: 300,
      y: 116.25,
    });
  });

  it('leaves an edge with no jog, and its label, untouched', () => {
    const straight: P[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const edge = { id: 'e2', points: straight, x: 50, y: 0 };
    expect(straightenEdgeTerminals([edge])).toEqual([]);
    expect(edge.points).toBe(straight);
  });

  // v12's real-ELK case, through the engine seam. v12's own graph leaves no jog on e1 under
  // v13's spacing (LayoutGraph.spacing, not v12's spacing.baseValue), so this is a graph found
  // the same way v12 found its own (randomised search) that does: e1 ("L1") steps 8.8 px.
  it('centres a real edge label on its route after a real ELK layout straightens it (#8292)', () => {
    const sizes: [string, number, number][] = [
      ['n0', 139, 47],
      ['n1', 77, 41],
      ['n2', 133, 57],
      ['n3', 50, 59],
      ['n4', 53, 59],
      ['n5', 111, 51],
    ];
    const edges: [string, string, string, [number, number]?][] = [
      ['e1', 'n3', 'n5', [32, 14]],
      ['e2', 'n1', 'n4'],
      ['e5', 'n2', 'n4', [22, 14]],
      ['e7', 'n3', 'n5'],
    ];
    const graph: LayoutGraph = {
      direction: 'TB',
      spacing: { node: 50, rank: 50, edge: 20 },
      nodes: sizes.map(([id, width, height]) => ({ id, width, height })),
      edges: edges.map(([id, source, target, l]) => ({
        id,
        source,
        target,
        minLen: 1,
        ...(l ? { label: { width: l[0], height: l[1] } } : {}),
      })),
      groups: [],
    };
    const distance = (straighten: boolean) => {
      const config = { elk: { straightenEdges: straighten } } as never;
      const e1 = elkEngine('layered')(graph, { config }).edges.get('e1')!;
      const label = e1.label!;
      let best = Infinity;
      for (let i = 0; i < e1.points.length - 1; i++) {
        const a = e1.points[i]!;
        const b = e1.points[i + 1]!;
        const [abx, aby] = [b.x - a.x, b.y - a.y];
        const lenSq = abx * abx + aby * aby;
        const t =
          lenSq === 0
            ? 0
            : Math.max(0, Math.min(1, ((label.x - a.x) * abx + (label.y - a.y) * aby) / lenSq));
        best = Math.min(best, Math.hypot(a.x + t * abx - label.x, a.y + t * aby - label.y));
      }
      return { best, points: e1.points.length };
    };
    const on = distance(true);
    const off = distance(false);
    // Off, ELK's own jog is there (at least 5 points); on, the run moved and the label with it.
    expect(off.points).toBeGreaterThanOrEqual(5);
    expect(on.points).toBeLessThan(off.points);
    expect(on.best).toBeLessThan(0.5);
  });
});

// ── render.spec.ts › straightenEdgeTerminals keeps labels off other edges (#8368) ───────────
describe('straightenEdgeTerminals keeps labels off other edges (#8368)', () => {
  interface Edge {
    id: string;
    points: P[];
    x?: number;
    y?: number;
    label?: string;
    width?: number;
    height?: number;
  }
  const segmentHitsBox = (a: P, b: P, box: { x1: number; y1: number; x2: number; y2: number }) =>
    Math.max(a.x, b.x) >= box.x1 &&
    Math.min(a.x, b.x) <= box.x2 &&
    Math.max(a.y, b.y) >= box.y1 &&
    Math.min(a.y, b.y) <= box.y2;
  const edgesUnderLabel = (edges: Edge[], labelled: Edge) => {
    const box = {
      x1: labelled.x! - labelled.width! / 2,
      y1: labelled.y! - labelled.height! / 2,
      x2: labelled.x! + labelled.width! / 2,
      y2: labelled.y! + labelled.height! / 2,
    };
    return edges
      .filter(
        (other) =>
          other !== labelled &&
          other.points.some(
            (p, i, all) => i < all.length - 1 && segmentHitsBox(p, all[i + 1]!, box)
          )
      )
      .map((other) => other.id);
  };
  const straightenAndProject = (edges: Edge[]) => {
    for (const { edge, runs } of straightenEdgeTerminals(edges)) {
      if (edge.x === undefined || edge.y === undefined) continue;
      const projected = projectLabelOntoStraightenedRun({ x: edge.x, y: edge.y }, runs);
      if (projected) [edge.x, edge.y] = [projected.x, projected.y];
    }
  };
  const forward = (): Edge => ({
    id: 'L_A_B_0',
    points: [
      { x: 74.34375, y: 54.61979166666667 },
      { x: 94.34375, y: 54.61979166666667 },
      { x: 94.34375, y: 42.203125 },
      { x: 142.8125, y: 42.203125 },
      { x: 191.28125, y: 42.203125 },
      { x: 191.28125, y: 45.96875 },
      { x: 211.28125, y: 45.96875 },
      { x: 223.26566632092, y: 45.96875 },
    ],
  });
  const back = (): Edge => ({
    id: 'L_B_A_0',
    label: 'changes',
    x: 142.8125,
    y: 73.203125,
    width: 56.9375,
    height: 20,
    points: [
      { x: 223.26566632092, y: 69.9375 },
      { x: 211.28125, y: 69.9375 },
      { x: 191.28125, y: 69.9375 },
      { x: 191.28125, y: 73.703125 },
      { x: 94.34375, y: 73.703125 },
      { x: 94.34375, y: 61.28645833333333 },
      { x: 74.34375, y: 61.28645833333333 },
    ],
  });

  it('does not straighten a labelled edge onto a route its label would then cover', () => {
    const edges = [forward(), back()];
    straightenAndProject(edges);
    expect(edgesUnderLabel(edges, edges[1]!)).toEqual([]);
    expect(edges[0]!.points).not.toEqual(forward().points);
    expect(edges[1]!.points).toEqual(back().points);
  });

  it('does not straighten an edge through a label placed before it', () => {
    const edges = [back(), forward()];
    straightenAndProject(edges);
    expect(edgesUnderLabel(edges, edges[0]!)).toEqual([]);
    expect(edges[0]!.points).not.toEqual(back().points);
    expect(edges[1]!.points).toEqual(forward().points);
  });
});
