// Ported from v12 `swimlanes/__tests__/edgeLabelRanks.spec.ts` (c9b12739f), through the engine on
// `LayoutGraph` inputs; v12's `validateLayout` is v13's (`layout/validate.ts`).
import { describe, expect, it } from 'vitest';
import type { Dir, LayoutGraph, Size } from '../../types.ts';
import { validateLayout } from '../../validate.ts';
import { COORDINATES } from '../config.ts';
import { swimlaneLayout, runSwimlane } from '../swimlane.ts';
import { layoutGraph } from './graphs.ts';

type EdgeSpec = [start: string, end: string, label?: boolean];

const NODE_SIZE = { width: 60, height: 40 };
// The size a one-letter label measures in the browser.
const SHORT_LABEL_SIZE = { width: 14, height: 21 };
// Taller than the default 100px rank spacing.
const TALL_LABEL_SIZE = { width: 40, height: 130 };
// Wider than the nodes, so counting it would raise the average node width.
const WIDE_LABEL_SIZE = { width: 400, height: 21 };

function graphOf(
  direction: Dir,
  lanes: Record<string, string[]>,
  edges: EdgeSpec[],
  labelSize: Size = SHORT_LABEL_SIZE
): LayoutGraph {
  return layoutGraph({
    direction,
    lanes,
    size: NODE_SIZE,
    edges: edges.map(([s, t, label]) => (label ? [s, t, labelSize] : [s, t])),
  });
}

const layOut = (...args: Parameters<typeof graphOf>) => runSwimlane(graphOf(...args));

const realNodes = (data: ReturnType<typeof layOut>) =>
  data.nodes.filter((node) => !node.isGroup && !node.isEdgeLabel);

/** The rank of every real node, keyed by id. */
const ranks = (data: ReturnType<typeof layOut>) =>
  Object.fromEntries(realNodes(data).map((node) => [node.id, node.layer]));

/** The position along the flow of every real node, keyed by id. */
function alongFlow(data: ReturnType<typeof layOut>, direction: Dir) {
  const axis = direction === 'TB' ? 'y' : 'x';
  return Object.fromEntries(realNodes(data).map((node) => [node.id, Math.round(node[axis]!)]));
}

const withoutLabels = (edges: EdgeSpec[]): EdgeSpec[] => edges.map(([start, end]) => [start, end]);

// #8327: a labelled cross-lane edge pushed its target down a rank.
const withinOneRank: [string, Dir, Record<string, string[]>, EdgeSpec[]][] = [
  ['a cross-lane edge (#8327)', 'TB', { s1: ['1a'], s2: ['2a'] }, [['1a', '2a', true]]],
  ['a cross-lane edge laid out LR', 'LR', { s1: ['1a'], s2: ['2a'] }, [['1a', '2a', true]]],
];
const cases: [string, Dir, Record<string, string[]>, EdgeSpec[]][] = [
  ...withinOneRank,
  ['an edge inside one lane', 'TB', { s1: ['A', 'B'] }, [['A', 'B', true]]],
  [
    'a mix of same-lane and cross-lane edges',
    'TB',
    { s1: ['A', 'B'], s2: ['C'] },
    [
      ['A', 'B', true],
      ['A', 'C', true],
      ['B', 'C'],
    ],
  ],
  ['an edge inside one lane laid out LR', 'LR', { s1: ['A', 'B'] }, [['A', 'B', true]]],
];

describe('swimlane edge labels do not change node ranks (#8327)', () => {
  it.each(cases)('keeps every rank for %s', (_, direction, lanes, edges) => {
    expect(ranks(layOut(direction, lanes, edges))).toEqual(
      ranks(layOut(direction, lanes, withoutLabels(edges)))
    );
  });

  it.each(withinOneRank)(
    'moves no node along the flow for a label within one rank: %s',
    (_, direction, lanes, edges) => {
      expect(alongFlow(layOut(direction, lanes, edges), direction)).toEqual(
        alongFlow(layOut(direction, lanes, withoutLabels(edges)), direction)
      );
    }
  );

  it.each(cases)('still places a valid label for %s', (_, direction, lanes, edges) => {
    const graph = graphOf(direction, lanes, edges);
    const model = swimlaneLayout(graph);
    expect(validateLayout(graph, model)).toEqual([]);
    for (const e of graph.edges.filter((edge) => edge.label)) {
      const at = model.edges.get(e.id)!.label!;
      expect(Number.isFinite(at.x) && Number.isFinite(at.y)).toBe(true);
    }
  });

  it('widens the gap between two ranks by the height of the label it holds', () => {
    const edges: EdgeSpec[] = [['A', 'B', true]];
    const labelled = layOut('TB', { s1: ['A', 'B'] }, edges, TALL_LABEL_SIZE);
    const plain = layOut('TB', { s1: ['A', 'B'] }, withoutLabels(edges));
    const nodeById = (data: typeof labelled, id: string) => data.nodes.find((n) => n.id === id)!;

    expect(nodeById(labelled, 'B').layer).toBe(nodeById(plain, 'B').layer);
    const gap = (data: typeof labelled) =>
      nodeById(data, 'B').y! - nodeById(data, 'A').y! - NODE_SIZE.height;
    expect(gap(labelled)).toBeGreaterThanOrEqual(gap(plain) + TALL_LABEL_SIZE.height);
    const graph = graphOf('TB', { s1: ['A', 'B'] }, edges, TALL_LABEL_SIZE);
    expect(validateLayout(graph, swimlaneLayout(graph))).toEqual([]);
  });

  it('spreads labels that share a gap in one lane instead of stacking them', () => {
    const graph = graphOf('TB', { s1: ['A', 'B'] }, [
      ['A', 'B', true],
      ['A', 'B', true],
    ]);
    const model = swimlaneLayout(graph);
    const [a, b] = [model.edges.get('e0')!.label!, model.edges.get('e1')!.label!];
    expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(SHORT_LABEL_SIZE.width);
    expect(validateLayout(graph, model)).toEqual([]);
  });

  it('keeps a lane around a label taller than the row of nodes beside it', () => {
    const graph = graphOf('TB', { s1: ['1a'], s2: ['2a'] }, [['1a', '2a', true]], TALL_LABEL_SIZE);
    const model = swimlaneLayout(graph);
    const label = model.edges.get('e0')!.label!;
    const lane = model.groups.get('s2')!;
    expect(label.y - TALL_LABEL_SIZE.height / 2).toBeGreaterThanOrEqual(lane.y - lane.height / 2);
    expect(label.y + TALL_LABEL_SIZE.height / 2).toBeLessThanOrEqual(lane.y + lane.height / 2);
  });

  it('gives an LR label its own width and clearance along the flow, no more', () => {
    const edges: EdgeSpec[] = [
      ['A', 'B', true],
      ['B', 'C'],
    ];
    const lanes = { s1: ['A', 'B', 'C'] };
    const labelled = layOut('LR', lanes, edges, WIDE_LABEL_SIZE);
    const plain = layOut('LR', lanes, withoutLabels(edges));

    expect(ranks(labelled)).toEqual(ranks(plain));
    const gap = (data: typeof labelled) => alongFlow(data, 'LR').C! - alongFlow(data, 'LR').A!;
    const reserved = WIDE_LABEL_SIZE.width + 2 * COORDINATES.EDGE_LABEL_CLEARANCE;
    expect(gap(labelled)).toBeCloseTo(gap(plain) + reserved, 0);
  });

  it('gives a label a finite position when an endpoint has no rank', () => {
    // An edge to a lane: groups take no rank.
    const graph = layoutGraph({
      lanes: { s1: ['A'], s2: [] },
      size: NODE_SIZE,
      edges: [['A', 's2', SHORT_LABEL_SIZE]],
    });
    const at = swimlaneLayout(graph).edges.get('e0')!.label!;
    expect(Number.isFinite(at.x) && Number.isFinite(at.y)).toBe(true);
  });
});
