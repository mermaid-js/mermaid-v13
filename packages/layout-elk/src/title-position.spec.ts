// Subgraph title positions under ELK (mermaid-js/mermaid#2977): the title's room moves to the
// bottom padding with it, and the title stays inside the frame, clear of the nodes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateLayout,
  type LayoutContext,
  type LayoutGraph,
  type LayoutModel,
} from '@mermaid-js/core/layout';
import { createMermaid } from 'mermaid';
import elkLayouts from './index.ts';

const FIXTURE = fileURLToPath(
  new URL(
    '../../../e2e/diagrams/flowchart/baseline/subgraphs/title-position-elk.mmd',
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
  const { warnings } = await m.render('d', source);
  expect(warnings).toEqual([]);
  expect(laid).toHaveLength(1);
  return laid[0]!;
}

describe('ELK subgraph title position', () => {
  const source = readFileSync(FIXTURE, 'utf8');

  it.each(['top-left', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'])(
    'puts the titles %s, inside their frames and clear of the nodes',
    async (position) => {
      const { graph, model } = await laidOut(source.replace('bottom-right', position));
      expect(validateLayout(graph, model)).toEqual([]);
      for (const g of graph.groups) {
        expect(g.titlePosition).toBe(position);
        const box = model.groups.get(g.id)!;
        const [w, h] = [g.title!.width / 2, g.title!.height / 2];
        expect(box.title.x - w).toBeGreaterThanOrEqual(box.x - box.width / 2);
        expect(box.title.x + w).toBeLessThanOrEqual(box.x + box.width / 2);
        expect(box.title.y - h).toBeGreaterThanOrEqual(box.y - box.height / 2);
        expect(box.title.y + h).toBeLessThanOrEqual(box.y + box.height / 2);
        const low = position.startsWith('bottom');
        for (const n of graph.nodes.filter((x) => x.parent === g.id)) {
          const at = model.nodes.get(n.id)!;
          if (low) expect(box.title.y - h).toBeGreaterThanOrEqual(at.y + at.height / 2);
          else expect(box.title.y + h).toBeLessThanOrEqual(at.y - at.height / 2);
        }
        if (position.endsWith('left')) expect(box.title.x).toBeLessThan(box.x);
        else if (position.endsWith('right')) expect(box.title.x).toBeGreaterThan(box.x);
        else expect(box.title.x).toBeCloseTo(box.x, 6);
      }
    }
  );

  it('gives a subgraph the same size with its title at the top or the bottom', async () => {
    const top = await laidOut(source.replace('bottom-right', 'top-center'));
    const low = await laidOut(source.replace('bottom-right', 'bottom-center'));
    for (const g of top.graph.groups) {
      const [a, b] = [top.model.groups.get(g.id)!, low.model.groups.get(g.id)!];
      expect(b.width).toBeCloseTo(a.width, 6);
      expect(b.height).toBeCloseTo(a.height, 6);
    }
  });
});
