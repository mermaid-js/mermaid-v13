// #683 row 7 (v12 mermaid-js/mermaid#8645): ELK routes an edge into a titled group straight
// through the title, which is drawn centred on the frame where a straight edge runs. The engine
// now moves that run beside the title, its label with it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateLayout,
  type LayoutContext,
  type LayoutGraph,
  type LayoutModel,
  type Point,
} from '@mermaid-js/core/layout';
import { createMermaid } from 'mermaid';
import elkLayouts from './index.ts';
import { ARROWHEAD_WIDTH } from './spread.ts';
import { TITLE_GAP, slideOffTitles, type SlideEdge, type SlideNode } from './titles.ts';

const FIXTURE = fileURLToPath(
  new URL(
    '../../../e2e/diagrams/flowchart/pr-check/elk-subgraph-title-edge-crossing.mmd',
    import.meta.url
  )
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

/** Whether segment a–b passes through the inside of `box` (x1, y1, x2, y2). */
function crosses(a: Point, b: Point, box: { x1: number; y1: number; x2: number; y2: number }) {
  const steps = 200;
  for (let i = 1; i < steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    if (x > box.x1 && x < box.x2 && y > box.y1 && y < box.y2) return true;
  }
  return false;
}

/** Every `edge × title` the routes of `model` cross, as `edge x group`. */
function titleCrossings({ graph, model }: { graph: LayoutGraph; model: LayoutModel }): string[] {
  const found: string[] = [];
  for (const g of graph.groups) {
    if (!g.title?.width) continue;
    const { title } = model.groups.get(g.id)!;
    const box = {
      x1: title.x - g.title.width / 2,
      y1: title.y - g.title.height / 2,
      x2: title.x + g.title.width / 2,
      y2: title.y + g.title.height / 2,
    };
    for (const [id, e] of model.edges)
      if (e.points.some((p, i) => i > 0 && crosses(e.points[i - 1]!, p, box)))
        found.push(`${id} x ${g.id}`);
  }
  return found;
}

/** Distance from `p` to the nearest segment of `route`. */
function distanceTo(route: readonly Point[], p: Point): number {
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const [a, b] = [route[i - 1]!, route[i]!];
    const len = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = len === 0 ? 0 : ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len;
    const c = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(a.x + c * (b.x - a.x) - p.x, a.y + c * (b.y - a.y) - p.y));
  }
  return best;
}

describe('edges beside group titles under ELK (#683 row 7)', () => {
  it('runs no edge of the fixture through a title, labels on their lines', async () => {
    const laid = await laidOut(readFileSync(FIXTURE, 'utf8'));
    expect(titleCrossings(laid)).toEqual([]);
    for (const [id, e] of laid.model.edges) {
      expect(distanceTo(e.points, e.label!), id).toBeLessThan(0.5);
      // The drawing grows to hold a label that moved with its run.
      const size = laid.graph.edges.find((g) => g.id === id)!.label!;
      expect(e.label!.x + size.width / 2, id).toBeLessThanOrEqual(laid.model.width);
    }
    expect(validateLayout(laid.graph, laid.model)).toEqual([]);
  });

  it('lays out a group whose title sits between two columns validly', async () => {
    // The title is narrower than the gap between the two columns either side of it.
    const laid = await laidOut(
      '---\nconfig:\n  layout: elk\n---\nflowchart TB\n  A --> B\n  A --> C\n  subgraph G [T]\n    B\n    C\n  end\n'
    );
    expect(titleCrossings(laid)).toEqual([]);
    expect(validateLayout(laid.graph, laid.model)).toEqual([]);
  });
});

// The pass on hand-made pictures: a frame whose title is 100 wide at x 50–150, y 100–116.
describe('the slide', () => {
  const title = { x1: 50, y1: 100, x2: 150, y2: 116 };
  /** The columns either side of the title. */
  const [LEFT, RIGHT] = [50 - TITLE_GAP, 150 + TITLE_GAP];
  const node = (id: string, x1: number, y1: number, w = 160, h = 40, flat = true): SlideNode => ({
    id,
    box: { x1, y1, x2: x1 + w, y2: y1 + h },
    flat,
  });
  /** A above the frame, B inside it under the title; A → B straight down at x 100. */
  const straight = (): { edges: SlideEdge[]; nodes: SlideNode[] } => ({
    nodes: [node('A', 20, 0), node('B', 20, 130)],
    edges: [
      {
        id: 'e',
        source: 'A',
        target: 'B',
        points: [
          { x: 100, y: 40 },
          { x: 100, y: 130 },
        ],
        label: { x: 100, y: 70, width: 40, height: 14 },
      },
    ],
  });

  it('moves a straight run to the nearer side of the title, the right one on a tie', () => {
    const { edges, nodes } = straight();
    expect(slideOffTitles(edges, [title], nodes)).toEqual(['e']);
    expect(edges[0]!.points).toEqual([
      { x: RIGHT, y: 40 },
      { x: RIGHT, y: 130 },
    ]);
  });

  it('takes the label along', () => {
    const { edges, nodes } = straight();
    slideOffTitles(edges, [title], nodes);
    expect(edges[0]!.label).toMatchObject({ x: RIGHT, y: 70 });
  });

  it('takes the nearer side', () => {
    const { edges, nodes } = straight();
    edges[0]!.points = edges[0]!.points.map((p) => ({ ...p, x: 70 }));
    edges[0]!.label!.x = 70;
    slideOffTitles(edges, [title], nodes);
    expect(edges[0]!.points[0]!.x).toBe(LEFT);
  });

  it('joins the column of a neighbouring run, which drops a jog', () => {
    const { edges, nodes } = straight();
    edges[0]!.points = [
      { x: 160, y: 40 },
      { x: 160, y: 60 },
      { x: 100, y: 60 },
      { x: 100, y: 130 },
    ];
    edges[0]!.label = undefined;
    slideOffTitles(edges, [title], nodes);
    expect(edges[0]!.points).toEqual([
      { x: 160, y: 40 },
      { x: 160, y: 60 },
      { x: 160, y: 130 },
    ]);
  });

  it('leaves the run when its node has no flat side there', () => {
    const { edges, nodes } = straight();
    nodes[1] = node('B', 20, 130, 160, 40, false);
    expect(slideOffTitles(edges, [title], nodes)).toEqual([]);
  });

  it('leaves the run when the node is too narrow to take it clear of its corners', () => {
    const { edges, nodes } = straight();
    nodes[1] = node('B', 60, 130, 80);
    expect(slideOffTitles(edges, [title], nodes)).toEqual([]);
  });

  it('leaves the run when a group end has no node to slide along', () => {
    const { edges, nodes } = straight();
    edges[0]!.target = 'G';
    expect(slideOffTitles(edges, [title], nodes)).toEqual([]);
  });

  it('does not take a column within two arrowheads of another edge', () => {
    const { edges, nodes } = straight();
    const near = RIGHT + ARROWHEAD_WIDTH - 1;
    nodes.push(node('C', 300, 0), node('D', 300, 300));
    edges.push({
      id: 'f',
      source: 'C',
      target: 'D',
      points: [
        { x: near, y: 20 },
        { x: near, y: 300 },
      ],
    });
    // The left side is free.
    slideOffTitles(edges, [title], nodes);
    expect(edges[0]!.points[0]!.x).toBe(LEFT);
  });

  it('does not slide into a crossing', () => {
    const { edges, nodes } = straight();
    nodes.push(node('C', 300, 0), node('D', -200, 0));
    // A horizontal edge at y 80 from x 130 to 300 and one from x 70 to -200: either side crosses.
    edges.push(
      {
        id: 'f',
        source: 'C',
        target: 'D',
        points: [
          { x: 300, y: 80 },
          { x: 130, y: 80 },
        ],
      },
      {
        id: 'g',
        source: 'D',
        target: 'C',
        points: [
          { x: -40, y: 90 },
          { x: 70, y: 90 },
        ],
      }
    );
    expect(slideOffTitles(edges, [title], nodes)).toEqual([]);
  });

  it('does not slide a label onto a node', () => {
    const { edges, nodes } = straight();
    nodes.push(node('N', 140, 60, 40, 20), node('M', 10, 60, 40, 20));
    expect(slideOffTitles(edges, [title], nodes)).toEqual([]);
  });

  it('leaves an edge that crosses no title', () => {
    const { edges, nodes } = straight();
    expect(slideOffTitles(edges, [{ x1: 300, y1: 100, x2: 400, y2: 116 }], nodes)).toEqual([]);
  });
});
