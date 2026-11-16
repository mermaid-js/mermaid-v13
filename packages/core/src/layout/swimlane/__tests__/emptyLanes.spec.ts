// v13-only: what the v12 changes behind the empty-lane fixtures assert (they come over as fixtures,
// #684): mermaid-js/mermaid#8754 (an empty lane in TB and BT gets a column of its own) and
// mermaid-js/mermaid#8772 (the same band in LR and RL). Each runs on the fixture's own capture,
// laid out in the directions v12 tested it in.
import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel } from '../../types.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { DDLT_FIXTURES, fixtureGraph } from './ddlt.fixtures.ts';

/** Exact equality of coordinates the engine computes by adding the same numbers. */
const EXACT_DIGITS = 6;

interface Span {
  id: string;
  from: number;
  to: number;
}

/** `id` laid out in `direction` (the fixture's own when omitted), with its graph. */
function layOut(id: string, direction?: string, without?: string) {
  const graph = fixtureGraph(id);
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
