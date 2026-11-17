import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { layered, titleCrossings, type LayoutGraph } from '@mermaid-js/core/layout';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';

// #675: under `layered` an edge entering or leaving a titled group through its top ran through
// the title text. The graphs come from the parser through the public API, as in
// flowchart-layout.spec.ts, and are laid out with `layered` whatever engine the text names.
async function graphOf(file: string, init: Record<string, unknown> = {}): Promise<LayoutGraph> {
  let captured: LayoutGraph | undefined;
  const m = createMermaid();
  m.initialize({ deterministic: true, ...init });
  const capture = (graph: LayoutGraph) => {
    captured = graph;
    return layered(graph);
  };
  m.registerLayoutLoaders(
    ['layered', 'swimlane'].map((name) => ({ name, loader: () => Promise.resolve(capture) }))
  );
  await m.render('mermaid-0', await readFile(join(REPO_ROOT, 'e2e/diagrams', file), 'utf8'));
  return captured!;
}

describe('layered keeps routes out of group titles (#675)', () => {
  it('moves each title off the edge that enters its group from above', async () => {
    const graph = await graphOf('flowchart/pr-check/layered-subgraph-title-edge-crossing.mmd');
    expect(graph.groups.map((g) => g.title !== undefined)).toEqual([true, true]);
    const model = layered(graph);
    expect(titleCrossings(graph, model)).toEqual([]);
    // Moved, not dropped: each title stays on its own band, inside its group.
    for (const g of graph.groups) {
      const box = model.groups.get(g.id)!;
      expect(Math.abs(box.title.x - box.x) + g.title!.width / 2).toBeLessThanOrEqual(box.width / 2);
    }
  });

  it('leaves the issue fixture with no edge through a lane title under `layout: layered`', async () => {
    const file = 'swimlanes/pr-check/13-disagree-exits-b-c-d.mmd';
    const graph = await graphOf(file, { layout: 'layered' });
    expect(titleCrossings(graph, layered(graph))).toEqual([]);
  });
});
