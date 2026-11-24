// Self-loop bookkeeping in `run` (#768, D618): made at a graph's first self-loop and fresh for each
// run. The routes are pinned as they were drawn when every run made it up front: no loop, one,
// several on one node (alternating sides, nesting outward), labelled, on a group, on the grid, and
// in a tight run that follows a loose one (`availableWidth`), all in both flow directions.
import { describe, expect, it } from 'vitest';
import type { Dir, LayoutEdge, LayoutGraph, LayoutModel } from '../types.ts';
import { cellProfile } from '../units.ts';
import { validateLayout } from '../validate.ts';
import { layered } from './index.ts';

const r = (x: number): number => Math.round(x * 100) / 100;

/** The drawing's size and every edge's route, label and ports, rounded. */
function routes(m: LayoutModel): unknown {
  return {
    size: [r(m.width), r(m.height)],
    edges: Object.fromEntries(
      [...m.edges].map(([id, e]) => [
        id,
        [
          e.points.map((p) => `${r(p.x)},${r(p.y)}`).join(' '),
          e.label ? `label ${r(e.label.x)},${r(e.label.y)}` : '',
          `${e.ports.source}/${e.ports.target}`,
        ].join(' | '),
      ])
    ),
  };
}

const LABELS = [
  { width: 40, height: 20 },
  { width: 30, height: 16 },
  { width: 50, height: 24 },
];

const loop = (id: string, on: string, k: number, labelled: boolean): LayoutEdge => ({
  id,
  source: on,
  target: on,
  minLen: 1,
  ...(labelled ? { label: LABELS[k % LABELS.length]! } : {}),
});

function graph(dir: Dir, loops: number, labelled: boolean, extra: Partial<LayoutGraph> = {}) {
  const g: LayoutGraph = {
    direction: dir,
    nodes: [
      { id: 'a', width: 80, height: 40 },
      { id: 'b', width: 60, height: 30 },
      { id: 'c', width: 70, height: 36, parent: 'G' },
    ],
    edges: [
      { id: 'ab', source: 'a', target: 'b', minLen: 1 },
      { id: 'bc', source: 'b', target: 'c', minLen: 1 },
      ...Array.from({ length: loops }, (_, k) => loop(`a${k}`, 'a', k, labelled)),
    ],
    groups: [{ id: 'G', padding: { top: 8, right: 8, bottom: 8, left: 8 } }],
    spacing: { node: 50, rank: 50, edge: 20 },
    diagramPadding: 8,
    ...extra,
  };
  return g;
}

describe('layered: self-loop bookkeeping, made at the first loop', () => {
  describe.each(['TB', 'LR'] as const)('%s', (dir) => {
    it.each([0, 1, 3])('%i loops on one node, unlabelled and labelled', (n) => {
      for (const labelled of [false, true]) {
        const g = graph(dir, n, labelled);
        const m = layered(g);
        expect(validateLayout(g, m)).toEqual([]);
        expect(routes(m)).toMatchSnapshot(labelled ? 'labelled' : 'plain');
      }
    });

    it("alternates sides: the second loop is the first's mirror", () => {
      const m = layered(graph(dir, 2, false));
      const [p, q] = [m.edges.get('a0')!.ports, m.edges.get('a1')!.ports];
      expect(p.source).toBe(p.target);
      expect(q.source).toBe(q.target);
      expect(p.source).not.toBe(q.source);
    });

    it('loops on a group and on two nodes in one graph', () => {
      const g = graph(dir, 1, true);
      g.edges.push(loop('G0', 'G', 0, true), loop('G1', 'G', 1, false), loop('b0', 'b', 2, true));
      const m = layered(g);
      expect(validateLayout(g, m)).toEqual([]);
      expect(routes(m)).toMatchSnapshot();
    });

    it('lays out the same each time: nothing carries over from one run to the next', () => {
      const g = graph(dir, 3, true);
      const first = routes(layered(g));
      layered(graph(dir, 0, false));
      expect(routes(layered(g))).toEqual(first);
    });

    it('a tight run after a loose one starts its own loop count (availableWidth)', () => {
      const loose = layered(graph(dir, 3, true));
      const g = graph(dir, 3, true, { availableWidth: loose.width - 1 });
      const m = layered(g);
      expect(validateLayout(g, m)).toEqual([]);
      expect(routes(m)).toMatchSnapshot();
      expect(routes(layered(g))).toEqual(routes(m));
    });
  });

  it('on the grid: several loops on a node and on a group take their own cells', () => {
    const profile = cellProfile();
    const g: LayoutGraph = {
      direction: 'TB',
      nodes: [
        { id: 'a', width: 5, height: 3 },
        { id: 'b', width: 5, height: 3, parent: 'G' },
      ],
      edges: [
        { id: 'ab', source: 'a', target: 'b', minLen: 1 },
        loop('a0', 'a', 0, false),
        { ...loop('a1', 'a', 0, false), label: { width: 3, height: 1 } },
        loop('a2', 'a', 0, false),
        loop('G0', 'G', 0, false),
      ],
      groups: [{ id: 'G', padding: { top: 1, right: 1, bottom: 1, left: 1 } }],
      spacing: { ...profile.builder.spacing },
      diagramPadding: 0,
      headRoom: profile.builder.headRoom,
      routing: 'stepped',
      metrics: profile.engine,
      grid: 1,
    };
    const m = layered(g);
    expect(routes(m)).toMatchSnapshot();
    expect(routes(layered(g))).toEqual(routes(m));
  });
});
