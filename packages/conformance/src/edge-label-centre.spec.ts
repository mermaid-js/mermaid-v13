import { describe, expect, it } from 'vitest';
import {
  layered,
  type LayoutContext,
  type LayoutEngine,
  type LayoutGraph,
  type LayoutModel,
} from '@mermaid-js/core/layout';
import elkLayouts from '@mermaid-js/layout-elk';
import { createMermaid } from 'mermaid';
import { fixture, labelGaps, pointTrim } from './edge-label-centre.ts';

// #1148, D682: an edge label sits midway along the line that shows, between the source's border
// and the base of the arrowhead, on the built-in layered engine and under ELK, for every curve. With
// heads at both ends or none, it stays midway between the two nodes.

/** The graph a diagram gives the layout engine for `source`, and the model it lays out. */
async function laidOut(
  source: string,
  elk = false
): Promise<{ graph: LayoutGraph; model: LayoutModel }> {
  let out: { graph: LayoutGraph; model: LayoutModel } | undefined;
  const recording =
    (engine: LayoutEngine): LayoutEngine =>
    (graph: LayoutGraph, ctx?: LayoutContext) => {
      const model = engine(graph, ctx);
      out = { graph, model };
      return model;
    };
  const m = createMermaid();
  m.initialize({ deterministic: true });
  m.registerLayoutLoaders(
    elk
      ? elkLayouts.map((l) => ({ ...l, loader: async () => recording(await l.loader()) }))
      : ['layered', 'dagre'].map((name) => ({
          name,
          loader: () => Promise.resolve(recording(layered)),
        }))
  );
  await m.render('d', source);
  expect(out).toBeDefined();
  return out!;
}

const CASES = [
  ['layered', 'the default curve', ''],
  ['layered', 'basis', '  flowchart:\n    curve: basis'],
  ['ELK', 'the default curve', '  layout: elk'],
  ['ELK', 'basis', '  layout: elk\n  flowchart:\n    curve: basis'],
] as const;

describe('an edge label', () => {
  it.each(CASES)(
    'is midway along the visible line of an edge with one arrowhead (%s, %s)',
    async (engine, _, config) => {
      const trim = await pointTrim();
      const { graph, model } = await laidOut(
        fixture('flowchart/baseline/edge-labels/tags.mmd', config),
        engine === 'ELK'
      );
      const gaps = labelGaps(graph, model);
      expect(gaps.size).toBe(5);
      for (const [id, { before, after }] of gaps)
        expect(Math.abs(before - (after - trim)), id).toBeLessThan(1);
    }
  );

  it.each(CASES)(
    'is midway between the nodes of an edge with heads at both ends or none (%s, %s)',
    async (engine, _, config) => {
      const { graph, model } = await laidOut(
        fixture(
          'flowchart/visual-check/4b-labeled-open-edges-should-not-have-arrowheads.mmd',
          config
        ),
        engine === 'ELK'
      );
      const gaps = labelGaps(graph, model);
      // Two open edges and one with a head at each end.
      expect([...gaps.keys()].sort()).toEqual(['L_A_B_0', 'L_E_F_0', 'L_G_H_0']);
      for (const [id, { before, after }] of gaps)
        expect(Math.abs(before - after), id).toBeLessThan(1);
    }
  );
});

// Between two neighbouring ranks of nodes the label has a rank of its own, where this applies;
// a label on an edge that passes ranks of nodes sits beside them, nearer its source.
describe('a relationship label between neighbouring ranks', () => {
  it.each([
    ['ER, with a marker at both ends', 'er-diagram/baseline/edge-labels/tags-line-color.mmd', 2],
    [
      'class, with a marker at both ends',
      'class-diagram/baseline/relationships/two-way-and-lollipop.mmd',
      2,
    ],
  ])('stays midway between the nodes in %s', async (_, path, count) => {
    const { graph, model } = await laidOut(fixture(path));
    const gaps = labelGaps(graph, model);
    expect(gaps.size).toBe(count);
    for (const [id, { before, after }] of gaps)
      expect(Math.abs(before - after), id).toBeLessThan(1);
  });
});

describe('the arrowhead ends a diagram gives the layered engine', () => {
  it('put a requirement `contains` marker at the source, every other relation at the target', async () => {
    const { graph } = await laidOut(fixture('requirement/baseline/relations/all-kinds-lr.mmd'));
    const heads = graph.edges.map((e) => [e.id, e.heads]);
    // The engine takes a head at the target alone as given.
    expect(heads.filter(([, h]) => h !== undefined)).toEqual([
      ['relation:a->b', { source: true, target: false }],
    ]);
    expect(heads).toHaveLength(7);
  });
});
