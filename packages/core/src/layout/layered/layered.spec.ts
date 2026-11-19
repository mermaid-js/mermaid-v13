import { describe, expect, it } from 'vitest';
import type { Dir, LayoutGraph, LayoutModel, Point } from '../types.ts';
import { countCrossings, validateLayout } from '../validate.ts';
import { hits, rectOf, type Rect } from './end-markers.ts';
import { layered } from './index.ts';
import { handBuiltFixtures, type LayoutFixture } from './layered.fixtures.ts';

// Hook for parser-produced fixtures: once the v13 flowchart parser and table measurer exist,
// graphs built from the e2e `.mmd` corpus join this list (from a spec in a package that may
// import the parser), and the same checks run over them.
const FIXTURES: LayoutFixture[] = handBuiltFixtures();

function plain(model: LayoutModel): unknown {
  return {
    ...model,
    nodes: [...model.nodes],
    edges: [...model.edges],
    groups: [...model.groups],
  };
}

describe('layered: DDLT checks on fixtures', () => {
  it.each(FIXTURES.map((f) => [f.name, f] as const))('%s is a valid layout', (_, fixture) => {
    expect(validateLayout(fixture.graph, layered(fixture.graph))).toEqual([]);
  });

  it.each(FIXTURES.map((f) => [f.name, f] as const))('%s lays out the same twice', (_, fixture) => {
    const copy = JSON.parse(JSON.stringify(fixture.graph)) as typeof fixture.graph;
    expect(plain(layered(fixture.graph))).toEqual(plain(layered(copy)));
  });

  it('records crossing counts', () => {
    const counts = Object.fromEntries(
      FIXTURES.map((f) => [f.name, countCrossings(layered(f.graph))])
    );
    expect(counts).toMatchSnapshot();
  });
});

// #768 (D618): several self-loops on one node each get their own route. The second is mirrored to
// the far side, later ones nest outward, alternating sides, in the room reserveLoop already keeps.
describe('layered: several self-loops on one node (#768, D618)', () => {
  const LABELS = [
    { width: 84, height: 24 },
    { width: 72, height: 24 },
    { width: 60, height: 40 },
    { width: 96, height: 24 },
  ];
  const loops = (dir: Dir, n: number, labelled = true): LayoutGraph => ({
    direction: dir,
    nodes: [{ id: 'R', width: 160, height: 90 }],
    edges: LABELS.slice(0, n).map((label, k) => ({
      id: `loop${k}`,
      source: 'R',
      target: 'R',
      minLen: 1,
      ...(labelled ? { label } : {}),
    })),
    groups: [],
    spacing: { node: 50, rank: 50, edge: 20 },
    diagramPadding: 8,
  });
  // The drawing's size before #768: the room for every loop was already kept.
  const SIZE: Record<string, [number, number]> = {
    'TB 2': [616, 106],
    'LR 2': [176, 330],
    'TB 4': [1056, 106],
    'LR 4': [176, 586],
  };
  const segments = (points: readonly Point[]): Rect[] =>
    points.slice(1).map((q, i) => {
      const p = points[i]!;
      return {
        x0: Math.min(p.x, q.x),
        y0: Math.min(p.y, q.y),
        x1: Math.max(p.x, q.x),
        y1: Math.max(p.y, q.y),
      };
    });
  const within = (m: LayoutModel, r: Rect): boolean =>
    r.x0 >= -1e-6 && r.y0 >= -1e-6 && r.x1 <= m.width + 1e-6 && r.y1 <= m.height + 1e-6;

  describe.each(['TB', 'LR'] as const)('%s', (dir) => {
    it.each([2, 4])('%i labelled loops: own routes, labels clear, inside, same size', (n) => {
      const g = loops(dir, n);
      const m = layered(g);
      const routes = g.edges.map((e) => m.edges.get(e.id)!);
      const labels = g.edges.map((e, k) => rectOf(routes[k]!.label!, e.label!));
      const box = rectOf(m.nodes.get('R')!, g.nodes[0]!);
      expect(new Set(routes.map((r) => JSON.stringify(r.points))).size).toBe(n);
      for (let i = 0; i < n; i++) {
        expect(within(m, labels[i]!), `label ${i} inside`).toBe(true);
        expect(hits(labels[i]!, box), `label ${i} off the node`).toBe(false);
        for (const s of segments(routes[i]!.points)) expect(within(m, s)).toBe(true);
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          if (j > i) expect(hits(labels[i]!, labels[j]!), `labels ${i}, ${j}`).toBe(false);
          for (const s of segments(routes[j]!.points))
            expect(hits(labels[i]!, s), `label ${i} on loop ${j}`).toBe(false);
        }
      }
      expect([m.width, m.height]).toEqual(SIZE[`${dir} ${n}`]);
      expect(validateLayout(g, m)).toEqual([]);
    });

    it('keeps the first loop where a lone loop goes, and mirrors the second', () => {
      const one = layered(loops(dir, 1)).edges.get('loop0')!;
      const two = layered(loops(dir, 2));
      const sides = dir === 'TB' ? ['right', 'left'] : ['bottom', 'top'];
      const first = two.edges.get('loop0')!;
      const second = two.edges.get('loop1')!;
      const shift = two.nodes.get('R')!.x - layered(loops(dir, 1)).nodes.get('R')!.x || 0;
      expect(first.ports).toEqual(one.ports);
      expect(first.ports.source).toBe(sides[0]);
      expect(second.ports).toEqual({ source: sides[1], target: sides[1] });
      expect(first.points.map((p) => p.x - shift)).toEqual(one.points.map((p) => p.x));
    });

    it('gives unlabelled loops their own routes too', () => {
      const m = layered(loops(dir, 4, false));
      const routes = [0, 1, 2, 3].map((k) => JSON.stringify(m.edges.get(`loop${k}`)!.points));
      expect(new Set(routes).size).toBe(4);
    });
  });
});
