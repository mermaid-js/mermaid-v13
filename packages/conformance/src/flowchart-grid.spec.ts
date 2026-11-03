import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import {
  cellProfile,
  layered,
  validateGrid,
  type LayoutGraph,
  type LayoutModel,
} from '@mermaid-js/core/layout';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { flowchart, type FlowModel, type FlowRenderContext } from '@mermaid-js/diagram-flowchart';
import { createMermaid, MermaidError } from 'mermaid';
import { REPO_ROOT, corpusFromDir } from './index.ts';

// The layered engine on the grid (#42, D78, D140) over the e2e flowchart corpus: the builder
// makes cell graphs (#43), routed `stepped` as the ASCII path does, and every model lies on the
// grid: whole cells, square segments, and each edge end in a cell of its own off a box corner.

interface Case {
  id: string;
  graph: LayoutGraph;
  model: LayoutModel;
}
const cases: Case[] = [];

beforeAll(async () => {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const theme = createTheme(await loadTheme('redux'), {});
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/flowchart'), 'flowchart')) {
    let prepared;
    try {
      prepared = await m.prepare(item.source);
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
      continue;
    }
    if (!prepared.diagramType.startsWith('flowchart')) continue;
    let graph: LayoutGraph | undefined;
    let model: LayoutModel | undefined;
    const ctx: FlowRenderContext = {
      config: prepared.config,
      measurer: cellMeasurer,
      units: cellProfile(),
      theme,
      warn: () => {},
      layout: (g) => {
        graph = { ...g, routing: 'stepped' };
        model = layered(graph);
        return model;
      },
    };
    flowchart.layout(prepared.parse.model as FlowModel, ctx);
    if (graph && model) cases.push({ id: item.id, graph, model });
  }
}, 240_000);

describe('flowchart corpus on the grid (cells)', () => {
  it('builds cell graphs with a grid', () => {
    expect(cases.length).toBeGreaterThan(400);
    for (const c of cases) expect(c.graph.grid, c.id).toBe(1);
  });

  it('lays every drawing out on whole cells, with every edge end in a cell of its own', () => {
    const bad = cases
      .map((c) => [c.id, validateGrid(c.graph, c.model)] as const)
      .filter(([, problems]) => problems.length > 0);
    expect(Object.fromEntries(bad)).toEqual({});
  });
});
