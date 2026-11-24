// The places of edge ends along a node's side: `spread` gives each side's ends their spacing, and
// `settle` moves them along it, keeping that order and spacing. Pinned: a single end, a side
// whose ends have no room between them at all, ends held by a group's member edges beside free
// ones, and a fan of many ends, in both flow directions.
import { describe, expect, it } from 'vitest';
import type { Dir, LayoutGraph, LayoutModel } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { layered } from './index.ts';

const r = (x: number): number => Math.round(x * 100) / 100;

/** Where each edge leaves and arrives, and the drawing's size, rounded. */
function ends(m: LayoutModel): unknown {
  return {
    size: [r(m.width), r(m.height)],
    edges: Object.fromEntries(
      [...m.edges].map(([id, e]) => {
        const a = e.points[0]!;
        const b = e.points[e.points.length - 1]!;
        return [id, `${r(a.x)},${r(a.y)} -> ${r(b.x)},${r(b.y)}`];
      })
    ),
  };
}

const base = (dir: Dir): Omit<LayoutGraph, 'nodes' | 'edges'> => ({
  direction: dir,
  groups: [],
  spacing: { node: 50, rank: 50, edge: 20 },
  diagramPadding: 8,
});

describe('layered: end places along a side', () => {
  describe.each(['TB', 'LR'] as const)('%s', (dir) => {
    it('a single end on each side stays in the middle', () => {
      const g: LayoutGraph = {
        ...base(dir),
        nodes: [
          { id: 'a', width: 80, height: 40 },
          { id: 'b', width: 60, height: 30 },
        ],
        edges: [{ id: 'ab', source: 'a', target: 'b', minLen: 1 }],
      };
      const m = layered(g);
      expect(validateLayout(g, m)).toEqual([]);
      const a = m.nodes.get('a')!;
      const start = m.edges.get('ab')!.points[0]!;
      expect(dir === 'TB' ? start.x : start.y).toBeCloseTo(dir === 'TB' ? a.x : a.y);
      expect(ends(m)).toMatchSnapshot();
    });

    it('several ends that leave a side with no room between them share one place', () => {
      // A side two units long: even half a pitch between ends is too much, so the ends that
      // leave side by side get no room at all.
      const g: LayoutGraph = {
        ...base(dir),
        nodes: [
          { id: 'hub', width: 2, height: 2, span: 2 },
          ...['p', 'q', 'r', 's', 't'].map((id) => ({ id, width: 40, height: 20 })),
        ],
        edges: ['p', 'q', 'r', 's', 't'].map((t) => ({
          id: `hub-${t}`,
          source: 'hub',
          target: t,
          minLen: 1,
        })),
      };
      const m = layered(g);
      expect(validateLayout(g, m)).toEqual([]);
      const starts = new Set(g.edges.map((e) => JSON.stringify(m.edges.get(e.id)!.points[0])));
      expect(starts.size).toBe(1);
      expect(ends(m)).toMatchSnapshot();
    });

    it('ends held by member edges of a group divide its free ends', () => {
      const g: LayoutGraph = {
        ...base(dir),
        nodes: [
          { id: 'x', width: 40, height: 20, parent: 'G' },
          { id: 'y', width: 40, height: 20, parent: 'G' },
          { id: 'z', width: 40, height: 20, parent: 'G' },
          { id: 'o', width: 60, height: 30 },
          { id: 'p', width: 60, height: 30 },
          { id: 'q', width: 60, height: 30 },
        ],
        edges: [
          { id: 'x-o', source: 'x', target: 'o', minLen: 1 },
          { id: 'G-o', source: 'G', target: 'o', minLen: 1 },
          { id: 'y-p', source: 'y', target: 'p', minLen: 1 },
          { id: 'G-p', source: 'G', target: 'p', minLen: 1 },
          { id: 'G-q', source: 'G', target: 'q', minLen: 1 },
          { id: 'z-q', source: 'z', target: 'q', minLen: 1 },
        ],
        groups: [{ id: 'G', padding: { top: 8, right: 8, bottom: 8, left: 8 } }],
      };
      const m = layered(g);
      expect(validateLayout(g, m)).toEqual([]);
      expect(ends(m)).toMatchSnapshot();
    });

    it('a fan of ends, one arriving, on a short side', () => {
      const g: LayoutGraph = {
        ...base(dir),
        nodes: [
          { id: 'hub', width: 30, height: 30 },
          ...['p', 'q', 'r', 's'].map((id) => ({ id, width: 40, height: 20 })),
        ],
        edges: [
          { id: 'hub-p', source: 'hub', target: 'p', minLen: 1 },
          { id: 'q-hub', source: 'q', target: 'hub', minLen: 1 },
          { id: 'hub-r', source: 'hub', target: 'r', minLen: 1 },
          { id: 'hub-s', source: 'hub', target: 's', minLen: 1 },
          { id: 'hub-p2', source: 'hub', target: 'p', minLen: 1 },
        ],
      };
      const m = layered(g);
      expect(validateLayout(g, m)).toEqual([]);
      expect(ends(m)).toMatchSnapshot();
    });
  });
});
