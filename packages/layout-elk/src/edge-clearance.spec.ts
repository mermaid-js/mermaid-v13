// Spec #1163, ticket B2 (#1165). #1160: ELK turned an edge 10px before its target, where the
// arrowhead needs more, so the line was trimmed past the corner and doubled back into the head.
// #1162: the straighten pass pulled the runs of a bidirectional labelled pair onto their port
// rows, and the two labels riding on them overlapped (v12 mermaid-js/mermaid#8580).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { LayoutContext, LayoutGraph, LayoutModel, Point, Size } from '@mermaid-js/core/layout';
import { createMermaid } from 'mermaid';
import elkLayouts from './index.ts';
import { LAST_LEG } from './spread.ts';
import { labelBox, segmentHitsBox, straightenEdgeTerminals } from './straighten.ts';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../e2e/diagrams/flowchart/pr-check/${name}.mmd`, import.meta.url)),
    'utf8'
  );

/** Renders `source` with the package registered; the graph ELK got and the model it gave. */
async function laidOut(source: string): Promise<{ graph: LayoutGraph; model: LayoutModel }> {
  const laid: { graph: LayoutGraph; model: LayoutModel }[] = [];
  const m = createMermaid();
  m.initialize({ deterministic: true });
  m.registerLayoutLoaders(
    elkLayouts.map((l) => ({
      ...l,
      loader: async () => {
        const engine = await l.loader();
        return (graph: LayoutGraph, ctx?: LayoutContext) => {
          const model = engine(graph, ctx);
          laid.push({ graph, model });
          return model;
        };
      },
    }))
  );
  await m.render('d', source);
  expect(laid).toHaveLength(1);
  return laid[0]!;
}

/** Rounding left by subtracting two route coordinates. */
const EPS = 1e-6;

const legs = (points: readonly Point[]): number[] =>
  points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));

/** How far apart two label boxes are: the larger of the gaps along x and along y. */
function boxGap(a: Point & Size, b: Point & Size): number {
  const dx = Math.abs(a.x - b.x) - (a.width + b.width) / 2;
  const dy = Math.abs(a.y - b.y) - (a.height + b.height) / 2;
  return Math.max(dx, dy);
}

/** Every main label the model placed, with the size the graph measured. */
const labels = ({ graph, model }: { graph: LayoutGraph; model: LayoutModel }) =>
  graph.edges.flatMap((e) => {
    const at = model.edges.get(e.id)!.label;
    return at && e.label ? [{ id: e.id, ...at, ...e.label }] : [];
  });

describe('the last leg before an arrowhead (#1160)', () => {
  it('holds the arrowhead, its lead and a full corner: 13.5 + 6 + 5', () => {
    expect(LAST_LEG).toBe(24.5);
  });

  it('is at least that long on every route of the 8368 fixture', async () => {
    const laid = await laidOut(fixture('8368-elk-label-parallel-edge'));
    // Every edge in the fixture is `-->`: an arrowhead at the target.
    for (const e of laid.graph.edges) {
      const points = laid.model.edges.get(e.id)!.points;
      expect(legs(points).at(-1)!, e.id).toBeGreaterThanOrEqual(LAST_LEG - EPS);
    }
  });

  it.each(['8368-elk-label-parallel-edge', '8580-elk-bidirectional-label-overlap'])(
    'leaves no leg shorter than 1px in %s',
    async (name) => {
      const laid = await laidOut(fixture(name));
      for (const e of laid.graph.edges) {
        const points = laid.model.edges.get(e.id)!.points;
        for (const leg of legs(points)) expect(leg, e.id).toBeGreaterThanOrEqual(1);
      }
    }
  );

  it('keeps the 8368 label clear of the parallel edge', async () => {
    const laid = await laidOut(fixture('8368-elk-label-parallel-edge'));
    const label = labels(laid).find((l) => l.id.startsWith('L_B_A'))!;
    const box = labelBox(label, label);
    const forward = laid.graph.edges.find((e) => e.source === 'A' && e.target === 'B')!;
    const route = laid.model.edges.get(forward.id)!.points;
    expect(route.some((p, i) => i > 0 && segmentHitsBox(route[i - 1]!, p, box))).toBe(false);
  });
});

describe('label boxes after straightening (#1162)', () => {
  it('keeps every two labels of the 8580 fixture spacing.edge apart', async () => {
    const laid = await laidOut(fixture('8580-elk-bidirectional-label-overlap'));
    const all = labels(laid);
    expect(all).toHaveLength(5);
    for (const [i, a] of all.entries())
      for (const b of all.slice(i + 1))
        expect(boxGap(a, b), `${a.id} / ${b.id}`).toBeGreaterThanOrEqual(
          laid.graph.spacing.edge - EPS
        );
  });

  // Two labels ELK left 30px apart, on runs with a step at their left ends (5px and 10px), each
  // towards the other. Straightening the first pulls its label 5px closer: 25 apart, clear of a
  // 20px gap. Straightening the second as well would leave 15: it keeps its step (decision 3).
  const pair = () => [
    {
      id: 'up',
      label: true,
      x: 100,
      y: 40,
      width: 80,
      height: 20,
      points: [
        { x: 0, y: 45 },
        { x: 20, y: 45 },
        { x: 20, y: 40 },
        { x: 180, y: 40 },
        { x: 180, y: 60 },
        { x: 200, y: 60 },
      ],
    },
    {
      id: 'down',
      label: true,
      x: 100,
      y: 90,
      width: 80,
      height: 20,
      points: [
        { x: 0, y: 80 },
        { x: 20, y: 80 },
        { x: 20, y: 90 },
        { x: 180, y: 90 },
        { x: 180, y: 70 },
        { x: 200, y: 70 },
      ],
    },
  ];

  it('straightens the first of a pair and leaves the second its step', () => {
    const edges = pair();
    const changed = straightenEdgeTerminals(edges, 20).map((c) => c.edge.id);
    expect(changed).toEqual(['up']);
    expect(edges[1]!.points).toEqual(pair()[1]!.points);
  });

  it('straightens both when the gap allows it', () => {
    expect(straightenEdgeTerminals(pair(), 10).map((c) => c.edge.id)).toEqual(['up', 'down']);
  });
});
