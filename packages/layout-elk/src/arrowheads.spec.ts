// #683 row 5 (v12 mermaid-js/mermaid#8621): ELK spreads the implicit ports of a side evenly
// between its corner margins, so four edges into a one-line node ended 3.6px apart and their
// arrowheads, 12.78px across, drew on top of each other. The engine now lays such a node out
// again with its ends an arrowhead apart, in the order ELK chose.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateLayout,
  type LayoutContext,
  type LayoutGraph,
  type LayoutModel,
  type Point,
  type Side,
} from '@mermaid-js/core/layout';
import { createMermaid } from 'mermaid';
import elkLayouts from './index.ts';
import { ARROWHEAD_WIDTH, crowdedEnds } from './spread.ts';

const FIXTURE = fileURLToPath(
  new URL('../../../e2e/diagrams/flowchart/pr-check/elk-fan-in-arrowheads.mmd', import.meta.url)
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
const EPS = 1e-9;

const elk = (body: string): string => `---\nconfig:\n  layout: elk\n---\n${body}`;

/** The side of node `id`'s box that `p` lies on, or undefined when it is on none. */
function sideAt(model: LayoutModel, id: string, p: Point): Side | undefined {
  const n = model.nodes.get(id)!;
  const [x0, x1, y0, y1] = [
    n.x - n.width / 2,
    n.x + n.width / 2,
    n.y - n.height / 2,
    n.y + n.height / 2,
  ];
  const within = (v: number, a: number, b: number) => v > a && v < b;
  if (Math.abs(p.x - x0) < 0.5 && within(p.y, y0, y1)) return 'left';
  if (Math.abs(p.x - x1) < 0.5 && within(p.y, y0, y1)) return 'right';
  if (Math.abs(p.y - y0) < 0.5 && within(p.x, x0, x1)) return 'top';
  if (Math.abs(p.y - y1) < 0.5 && within(p.x, x0, x1)) return 'bottom';
  return undefined;
}

/** The tips of the edges into `target`, all on `side` of it, and the smallest gap between two. */
function tips(
  { graph, model }: { graph: LayoutGraph; model: LayoutModel },
  target: string,
  side: Side
): { count: number; gap: number } {
  const ends = graph.edges
    .filter((e) => e.target === target && e.source !== target)
    .map((e) => model.edges.get(e.id)!.points.at(-1)!);
  for (const p of ends) expect(sideAt(model, target, p), JSON.stringify(p)).toBe(side);
  const along = ends
    .map((p) => (side === 'left' || side === 'right' ? p.y : p.x))
    .sort((a, b) => a - b);
  const gaps = along.slice(1).map((v, i) => v - along[i]!);
  return { count: ends.length, gap: Math.min(...gaps) };
}

describe('arrowheads into one side of a node under ELK (#683 row 5)', () => {
  it('keeps the four tips of the fixture an arrowhead apart', async () => {
    const laid = await laidOut(readFileSync(FIXTURE, 'utf8'));
    expect(laid.graph.nodes.find((n) => n.id === 'M')!.height).toBeLessThan(4 * ARROWHEAD_WIDTH);
    const { count, gap } = tips(laid, 'M', 'left');
    expect(count).toBe(4);
    expect(gap).toBeGreaterThanOrEqual(ARROWHEAD_WIDTH - EPS);
    expect(validateLayout(laid.graph, laid.model)).toEqual([]);
  });

  it.each([
    ['LR', 3, 'left'],
    ['RL', 4, 'right'],
  ] as const)('keeps %s fan-in of %i an arrowhead apart', async (dir, inputs, side) => {
    const sources = ['P', 'Q', 'R', 'S'].slice(0, inputs);
    const laid = await laidOut(
      elk(`flowchart ${dir}\n${sources.map((s) => `  ${s}[${s}] --> M[Hub]`).join('\n')}\n`)
    );
    const { count, gap } = tips(laid, 'M', side);
    expect(count).toBe(inputs);
    expect(gap).toBeGreaterThanOrEqual(ARROWHEAD_WIDTH - EPS);
    expect(validateLayout(laid.graph, laid.model)).toEqual([]);
  });

  it('spreads four inputs on the narrow top of a top-down node', async () => {
    const laid = await laidOut(
      elk('flowchart TB\n  P --> Q((Q))\n  R --> Q\n  S --> Q\n  T --> Q\n  Q --> X\n')
    );
    expect(laid.graph.nodes.find((n) => n.id === 'Q')!.width).toBeLessThan(4 * ARROWHEAD_WIDTH);
    const { gap } = tips(laid, 'Q', 'top');
    expect(gap).toBeGreaterThanOrEqual(ARROWHEAD_WIDTH - EPS);
  });

  it('spreads the inputs of a node inside a subgraph with its own direction', async () => {
    const laid = await laidOut(
      elk(
        'flowchart TB\n  subgraph G\n    direction LR\n    P --> M[Hub]\n    Q --> M\n    R --> M\n  end\n'
      )
    );
    const { count, gap } = tips(laid, 'M', 'left');
    expect(count).toBe(3);
    expect(gap).toBeGreaterThanOrEqual(ARROWHEAD_WIDTH - EPS);
    expect(validateLayout(laid.graph, laid.model)).toEqual([]);
  });

  it('keeps a node with a loop on it laid out', async () => {
    const laid = await laidOut(
      elk('flowchart LR\n  P --> M[Hub]\n  Q --> M\n  R --> M\n  M --> M\n')
    );
    expect(validateLayout(laid.graph, laid.model)).toEqual([]);
  });
});

// Which ends `crowdedEnds` moves, on a laid-out picture: node boxes and the route of each edge.
describe('the nodes the engine spreads', () => {
  const box = (x: number, y: number, width = 100, height = 40) => ({ x, y, width, height });
  /** `n` edges from the left into the left side of `M` (at 200, 0, 100 × 40), `step` apart. */
  const fanIn = (n: number, step: number) => {
    const boxes = new Map([['M', box(200, 0)]]);
    const routes = new Map<string, Point[]>();
    const edges: LayoutGraph['edges'] = [];
    const first = 20 - (step * (n - 1)) / 2;
    for (let i = 0; i < n; i++) {
      const id = `S${i}`;
      boxes.set(id, box(0, i * 60 - 60));
      edges.push({ id: `e${i}`, source: id, target: 'M', minLen: 1 });
      routes.set(`e${i}`, [
        { x: 100, y: i * 60 - 40 },
        { x: 150, y: i * 60 - 40 },
        { x: 150, y: first + i * step },
        { x: 200, y: first + i * step },
      ]);
    }
    return { boxes, routes, edges };
  };

  it('spreads three or more arrowheads closer than an arrowhead', () => {
    const { boxes, routes, edges } = fanIn(3, 6);
    const pinned = crowdedEnds(edges, boxes, routes, new Set());
    const ports = pinned.get('M')!;
    expect(ports.map((p) => p.edge)).toEqual(['e0', 'e1', 'e2']);
    expect(ports.every((p) => p.side === 'left' && p.x === 0)).toBe(true);
    expect(ports[1]!.y - ports[0]!.y).toBeCloseTo(ARROWHEAD_WIDTH);
    expect(ports[2]!.y - ports[1]!.y).toBeCloseTo(ARROWHEAD_WIDTH);
    // About where ELK had them: the middle one stays put.
    expect(ports[1]!.y).toBeCloseTo(20);
  });

  it('leaves two arrowheads to ELK', () => {
    const { boxes, routes, edges } = fanIn(2, 6);
    expect(crowdedEnds(edges, boxes, routes, new Set()).size).toBe(0);
  });

  it('leaves arrowheads that are already an arrowhead apart', () => {
    const { boxes, routes, edges } = fanIn(3, ARROWHEAD_WIDTH);
    expect(crowdedEnds(edges, boxes, routes, new Set()).size).toBe(0);
  });

  it('leaves the source of a fan-out alone: its ends carry no arrowhead', () => {
    const { boxes, routes, edges } = fanIn(3, 6);
    const out = edges.map((e) => ({ ...e, source: e.target, target: e.source }));
    const back = new Map([...routes].map(([id, r]) => [id, [...r].reverse()]));
    expect(crowdedEnds(out, boxes, back, new Set()).size).toBe(0);
  });

  it('counts the start markers an edge names', () => {
    const { boxes, routes, edges } = fanIn(3, 6);
    const marker = { length: 10, width: 10 };
    const out = edges.map((e) => ({
      ...e,
      source: e.target,
      target: e.source,
      startMarker: marker,
    }));
    const back = new Map([...routes].map(([id, r]) => [id, [...r].reverse()]));
    const ports = crowdedEnds(out, boxes, back, new Set()).get('M')!;
    expect(ports.map((p) => p.end)).toEqual(['source', 'source', 'source']);
  });

  it('keeps the ends a marker wider than an arrowhead apart by its width', () => {
    const { boxes, routes, edges } = fanIn(3, 6);
    const wide = edges.map((e) => ({ ...e, endMarker: { length: 14, width: 14 } }));
    const ports = crowdedEnds(wide, boxes, routes, new Set()).get('M')!;
    expect(ports[1]!.y - ports[0]!.y).toBeCloseTo(14);
  });

  it('skips the nodes it is told to (groups, nodes with ports of their own)', () => {
    const { boxes, routes, edges } = fanIn(3, 6);
    expect(crowdedEnds(edges, boxes, routes, new Set(['M'])).size).toBe(0);
  });

  it('pins every other end of a spread node where ELK put it', () => {
    const { boxes, routes, edges } = fanIn(3, 6);
    boxes.set('X', box(400, 0));
    edges.push({ id: 'out', source: 'M', target: 'X', minLen: 1 });
    routes.set('out', [
      { x: 300, y: 17 },
      { x: 400, y: 17 },
    ]);
    const ports = crowdedEnds(edges, boxes, routes, new Set()).get('M')!;
    expect(ports.find((p) => p.edge === 'out')).toEqual({
      edge: 'out',
      end: 'source',
      side: 'right',
      x: 100,
      y: 17,
    });
  });

  it('fits the ends inside a side too short for an arrowhead between each', () => {
    const { boxes, routes, edges } = fanIn(4, 3);
    boxes.set('M', box(200, 10, 100, 20));
    const ports = crowdedEnds(edges, boxes, routes, new Set()).get('M')!;
    for (const p of ports) {
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(20);
    }
    expect(ports[1]!.y - ports[0]!.y).toBeGreaterThan(3);
  });
});
