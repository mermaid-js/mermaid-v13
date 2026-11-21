// v13-only: what the v12 changes behind the empty-lane and tight-spacing fixtures assert (they
// come over as fixtures, #684): mermaid-js/mermaid#8754 (an empty lane in TB and BT gets a column
// of its own), mermaid-js/mermaid#8772 (the same band in LR and RL) and mermaid-js/mermaid#8788
// (below a node spacing of 20, neighbouring lanes still keep their padding). Each runs on the
// fixture's own capture, laid out in the directions v12 tested it in.
import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel } from '../../types.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { DDLT_FIXTURES, fixtureGraph } from './ddlt.fixtures.ts';

/** Two lanes touch when the seam between them is under this (px), as v12's `TOLERANCE`. */
const SEAM_TOLERANCE = 0.5;
/** The node spacing from which twice it is no less than the lane padding on both sides. */
const TIGHT_LIMIT = 20;
/** A lane padding wider than the default node spacing's half (v12's `WIDE_LANE_PADDING`). */
const WIDE_LANE_PADDING = 60;
/** Exact equality of coordinates the engine computes by adding the same numbers. */
const EXACT_DIGITS = 6;

interface Span {
  id: string;
  from: number;
  to: number;
}

/** `id` laid out in `direction` (the fixture's own when omitted), with its graph. */
function layOut(
  id: string,
  direction?: string,
  without?: string,
  paddings: Readonly<Record<string, number>> = {}
) {
  const graph = fixtureGraph(id);
  for (const g of graph.groups) {
    const padding = paddings[g.id];
    if (padding !== undefined) g.padding = { ...g.padding, left: padding, right: padding };
  }
  if (direction) (graph as { direction: string }).direction = direction;
  if (without) {
    graph.groups = graph.groups.filter((g) => g.id !== without);
  }
  return { graph, model: swimlaneLayout(graph, DDLT_FIXTURES[id]!.tuning) };
}

/** The lanes along the cross axis (`x` for TB and BT, `y` for LR and RL), in drawing order. */
function lanesAcross(graph: LayoutGraph, model: LayoutModel, axis: 'x' | 'y'): Span[] {
  const size = axis === 'x' ? 'width' : 'height';
  return graph.groups
    .map((g) => {
      const box = model.groups.get(g.id)!;
      return { id: g.id, from: box[axis] - box[size] / 2, to: box[axis] + box[size] / 2 };
    })
    .sort((a, b) => a.from - b.from);
}

/** Every lane touches the next one: none overlaps it and none leaves a gap. */
function expectTouching(spans: readonly Span[]): void {
  for (const [i, span] of spans.entries()) {
    if (i > 0)
      expect(span.from - spans[i - 1]!.to, `${span.id} after ${spans[i - 1]!.id}`).toBeCloseTo(
        0,
        0
      );
  }
}

/**
 * How much room beyond its lane's padding the node with the least keeps on its tighter side along
 * `axis`: 0 or more when every node keeps its padding.
 */
function smallestSpare(graph: LayoutGraph, model: LayoutModel, axis: 'x' | 'y'): number {
  const size = axis === 'x' ? 'width' : 'height';
  const spares = graph.nodes.map((n) => {
    const node = model.nodes.get(n.id)!;
    const lane = model.groups.get(n.parent!)!;
    const [from, to] = [lane[axis] - lane[size] / 2, lane[axis] + lane[size] / 2];
    const inset = Math.min(node[axis] - node[size] / 2 - from, to - node[axis] - node[size] / 2);
    return inset - paddingOf(graph, n.parent!);
  });
  return Math.min(...spares);
}

/** The width of a lane's title as the graph measures it. */
const titleWidth = (graph: LayoutGraph, id: string): number =>
  graph.groups.find((g) => g.id === id)!.title!.width;

/** The room a lane keeps around its nodes across the flow: the padding the graph gives its group. */
const paddingOf = (graph: LayoutGraph, id: string): number => {
  const padding = graph.groups.find((g) => g.id === id)!.padding;
  return Math.min(padding.left, padding.right);
};

describe('#684: an empty lane gets a column of its own in TB and BT (mermaid-js/mermaid#8754)', () => {
  const id = 'regressions/tb-empty-lane';

  it.each(['TB', 'BT'])(
    '%s: it stands between its neighbours and the next lane moves with its nodes',
    (direction) => {
      const { graph, model } = layOut(id, direction);
      const control = layOut(id, direction, 'L2').model;
      const spans = lanesAcross(graph, model, 'x');
      expect(spans.map((s) => s.id)).toEqual(['L1', 'L2', 'L3']);
      expectTouching(spans);
      const legal = model.groups.get('L2')!;
      expect(legal.height).toBeGreaterThan(0);
      expect(legal.width).toBeGreaterThanOrEqual(
        titleWidth(graph, 'L2') + 2 * paddingOf(graph, 'L2')
      );
      for (const node of ['A', 'B'])
        expect(model.nodes.get(node)!.x).toBeCloseTo(control.nodes.get(node)!.x, EXACT_DIGITS);
      for (const node of ['C', 'D'])
        expect(model.nodes.get(node)!.x).toBeCloseTo(
          control.nodes.get(node)!.x + legal.width,
          EXACT_DIGITS
        );
    }
  );

  it('it is as tall as its neighbours', () => {
    const { model } = layOut(id);
    expect(model.groups.get('L2')!.y).toBe(model.groups.get('L1')!.y);
    expect(model.groups.get('L2')!.height).toBe(model.groups.get('L1')!.height);
  });
});

describe('#684: an empty lane gets a band of its own in LR and RL (mermaid-js/mermaid#8772)', () => {
  const id = 'regressions/lr-empty-lane';

  it.each(['LR', 'RL'])(
    '%s: it stands between its neighbours, as wide as they are, and the next lane moves with its nodes',
    (direction) => {
      const { graph, model } = layOut(id, direction);
      const control = layOut(id, direction, 'L2').model;
      const spans = lanesAcross(graph, model, 'y');
      expect(spans.map((s) => s.id)).toEqual(['L1', 'L2', 'L3']);
      expectTouching(spans);
      const [sales, legal, warehouse] = [
        model.groups.get('L1')!,
        model.groups.get('L2')!,
        model.groups.get('L3')!,
      ];
      expect(legal.height).toBeGreaterThanOrEqual(
        titleWidth(graph, 'L2') + 2 * paddingOf(graph, 'L2')
      );
      expect(legal.width).toBeCloseTo(sales.width, EXACT_DIGITS);
      expect(legal.x).toBeCloseTo(sales.x, EXACT_DIGITS);
      expect(warehouse.y).toBeCloseTo(control.groups.get('L3')!.y + legal.height, EXACT_DIGITS);
      for (const node of ['A', 'B'])
        expect(model.nodes.get(node)!.y).toBeCloseTo(control.nodes.get(node)!.y, EXACT_DIGITS);
      for (const node of ['C', 'D'])
        expect(model.nodes.get(node)!.y).toBeCloseTo(
          control.nodes.get(node)!.y + legal.height,
          EXACT_DIGITS
        );
    }
  );
});

describe('#684: with automatic lane ordering an empty lane stands beside the lanes declared next to it (mermaid-js/mermaid#8754, mermaid-js/mermaid#8772)', () => {
  const id = 'regressions/tb-empty-first-lane-auto-order';

  it.each(['TB', 'BT', 'LR', 'RL'])(
    '%s: an empty first lane stands right before the lane declared after it, and only the lanes from there on move',
    (direction) => {
      const axis = direction === 'LR' || direction === 'RL' ? 'y' : 'x';
      const { graph, model } = layOut(id, direction);
      const control = layOut(id, direction, 'L0').model;
      const spans = lanesAcross(graph, model, axis);
      // Ordering puts Left (L2) before Hub (L1); the empty lane (L0) is declared before Hub.
      expect(spans.map((s) => s.id)).toEqual(['L2', 'L0', 'L1', 'L3']);
      expectTouching(spans);
      const empty = model.groups.get('L0')!;
      const width = axis === 'x' ? empty.width : empty.height;
      expect(model.nodes.get('b')![axis]).toBeCloseTo(control.nodes.get('b')![axis], EXACT_DIGITS);
      for (const node of ['a', 'c'])
        expect(model.nodes.get(node)![axis]).toBeCloseTo(
          control.nodes.get(node)![axis] + width,
          EXACT_DIGITS
        );
    }
  );
});

describe('#684: at a node spacing below 20 neighbouring lanes keep their padding (mermaid-js/mermaid#8788)', () => {
  const TIGHT = [
    'regressions/tb-lanes-keep-padding-tight-spacing',
    'regressions/tb-empty-lane-tight-spacing',
    'regressions/tb-empty-first-lane-auto-order',
  ];

  it.each(TIGHT)('%s is laid out at a node spacing of 10', (id) => {
    expect(fixtureGraph(id).spacing.node).toBe(10);
  });

  describe.each(TIGHT.flatMap((id) => ['TB', 'BT'].map((direction) => [id, direction] as const)))(
    '%s in %s',
    (id, direction) => {
      it('no lane overlaps another', () => {
        const { graph, model } = layOut(id, direction);
        const spans = lanesAcross(graph, model, 'x');
        const overlaps = spans.slice(1).map((s, i) => spans[i]!.to - s.from);
        expect(Math.max(...overlaps)).toBeLessThanOrEqual(SEAM_TOLERANCE);
      });

      it('every node stays inside its lane with the lane padding on both sides', () => {
        const { graph, model } = layOut(id, direction);
        expect(smallestSpare(graph, model, 'x')).toBeGreaterThanOrEqual(-SEAM_TOLERANCE);
      });
    }
  );

  it.each(['TB', 'BT'])('%s: the two populated lanes touch', (direction) => {
    const id = 'regressions/tb-lanes-keep-padding-tight-spacing';
    const { graph, model } = layOut(id, direction);
    expectTouching(lanesAcross(graph, model, 'x'));
  });

  it.each(['TB', 'BT'])(
    '%s: an empty lane keeps the lane after it clear, and that lane moves with its nodes',
    (direction) => {
      const id = 'regressions/tb-empty-lane-tight-spacing';
      const { graph, model } = layOut(id, direction);
      const control = layOut(id, direction, 'L2').model;
      const spans = lanesAcross(graph, model, 'x');
      expect(spans.map((s) => s.id)).toEqual(['L1', 'L2', 'L3']);
      expectTouching(spans);
      const moved = model.groups.get('L3')!.x - control.groups.get('L3')!.x;
      expect(moved).toBeGreaterThan(0);
      expect(model.nodes.get('C')!.x).toBeCloseTo(control.nodes.get('C')!.x + moved, EXACT_DIGITS);
      expect(model.nodes.get('A')!.x).toBeCloseTo(control.nodes.get('A')!.x, EXACT_DIGITS);
    }
  );
  describe.each(['LR', 'RL'])('%s', (direction) => {
    it.each([0, 10, 19])(
      'node spacing %d: the lanes are rows that touch, none overlapping',
      (node) => {
        const id = 'regressions/tb-lanes-keep-padding-tight-spacing';
        const graph = fixtureGraph(id);
        (graph as { direction: string }).direction = direction;
        graph.spacing = { ...graph.spacing, node };
        const model = swimlaneLayout(graph, DDLT_FIXTURES[id]!.tuning);
        const spans = lanesAcross(graph, model, 'y');
        expect(spans).toHaveLength(2);
        expectTouching(spans);
      }
    );

    // The lane gap is for TB and BT, whose lanes are columns; LR and RL stack touching rows whose
    // height still follows the node spacing, so tightening it still makes the rows shorter.
    it('a node spacing of 10 gives shorter rows than a node spacing of 20', () => {
      const id = 'regressions/tb-lanes-keep-padding-tight-spacing';
      const rowHeight = (node: number): number => {
        const graph = fixtureGraph(id);
        (graph as { direction: string }).direction = direction;
        graph.spacing = { ...graph.spacing, node };
        const [row] = lanesAcross(graph, swimlaneLayout(graph, DDLT_FIXTURES[id]!.tuning), 'y');
        return row!.to - row!.from;
      };
      expect(rowHeight(10)).toBeLessThan(rowHeight(TIGHT_LIMIT));
    });
  });

  it.each(['TB', 'BT'])(
    '%s: a lane padding wider than half the node spacing is kept, whichever lane has it',
    (direction) => {
      const id = 'regressions/tb-lanes-keep-padding-tight-spacing';
      for (const wide of ['L1', 'L2']) {
        const { graph, model } = layOut(id, direction, undefined, { [wide]: WIDE_LANE_PADDING });
        expect(paddingOf(graph, wide)).toBe(WIDE_LANE_PADDING);
        expectTouching(lanesAcross(graph, model, 'x'));
        expect(smallestSpare(graph, model, 'x'), wide).toBeGreaterThanOrEqual(-SEAM_TOLERANCE);
      }
    }
  );
});
