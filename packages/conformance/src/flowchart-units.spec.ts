import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import {
  cellProfile,
  layered,
  pxProfile,
  type LayoutGraph,
  type UnitProfile,
} from '@mermaid-js/core/layout';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { flowchart, type FlowModel, type FlowRenderContext } from '@mermaid-js/diagram-flowchart';
import { createMermaid, MermaidError, type Prepared } from 'mermaid';
import { REPO_ROOT, corpusFromDir } from './index.ts';

// The flowchart graph builder takes every length from the unit profile (#43, D77, R-ARCH-3).
// The graphs are built through the plugin's `layout` with a context that carries the profile
// and records the LayoutGraph it hands the engine.

const corpus: { id: string; prepared: Prepared }[] = [];

beforeAll(async () => {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/flowchart'), 'flowchart')) {
    try {
      const prepared = await m.prepare(item.source);
      if (prepared.diagramType.startsWith('flowchart')) corpus.push({ id: item.id, prepared });
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
    }
  }
}, 120_000);

/** The graph the builder hands the engine for a cell profile, measured in cells. */
async function build(prepared: Prepared, units: UnitProfile): Promise<LayoutGraph> {
  const theme = createTheme(await loadTheme('redux'), {});
  let graph: LayoutGraph | undefined;
  const ctx: FlowRenderContext = {
    config: prepared.config,
    measurer: cellMeasurer,
    units,
    theme,
    warn: () => {},
    layout: (g) => {
      graph = g;
      return layered(g);
    },
  };
  flowchart.layout(prepared.parse.model as FlowModel, ctx);
  return graph!;
}

/** Every length in the graph, with a path for the failure message. */
function lengths(g: LayoutGraph): [string, number][] {
  const out: [string, number][] = [];
  const put = (path: string, v: number | undefined): void => {
    if (v !== undefined) out.push([path, v]);
  };
  for (const n of g.nodes) {
    put(`node ${n.id} width`, n.width);
    put(`node ${n.id} height`, n.height);
    put(`node ${n.id} span`, n.span);
  }
  for (const gr of g.groups) {
    for (const side of ['top', 'right', 'bottom', 'left'] as const)
      put(`group ${gr.id} padding.${side}`, gr.padding[side]);
    put(`group ${gr.id} title.width`, gr.title?.width);
    put(`group ${gr.id} title.height`, gr.title?.height);
  }
  for (const e of g.edges) {
    put(`edge ${e.id} label.width`, e.label?.width);
    put(`edge ${e.id} label.height`, e.label?.height);
  }
  put('spacing.node', g.spacing.node);
  put('spacing.rank', g.spacing.rank);
  put('spacing.edge', g.spacing.edge);
  put('diagramPadding', g.diagramPadding);
  put('headRoom', g.headRoom);
  return out;
}

describe('flowchart graph builder with the cell profile', () => {
  it('gives every LayoutGraph length as a whole number of cells over the corpus', async () => {
    expect(corpus.length).toBeGreaterThan(300);
    const bad: string[] = [];
    for (const { id, prepared } of corpus) {
      const g = await build(prepared, cellProfile());
      for (const [path, v] of lengths(g))
        if (!Number.isInteger(v) || v < 0) bad.push(`${id}: ${path} = ${v}`);
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it('hands the engine the profile metrics and the grid', async () => {
    const units = cellProfile();
    const g = await build(corpus[0]!.prepared, units);
    expect(g.metrics).toBe(units.engine);
    expect(g.grid).toBe(1);
  });

  it('sizes a node as a text-form box and converts px config with cell minimums', async () => {
    const m = createMermaid();
    const prepared = await m.prepare(
      '---\nconfig:\n  flowchart:\n    nodeSpacing: 8\n    rankSpacing: 16\n---\nflowchart TD\n  A[Hello] --> B((two<br>lines))\n'
    );
    const g = await build(prepared, cellProfile());
    // label 5 + 2·1 + 2 wide, 1 line + 2·0 + 2 high (compact padding).
    expect(g.nodes.find((n) => n.id === 'A')).toMatchObject({ width: 9, height: 3 });
    expect(g.nodes.find((n) => n.id === 'B')).toMatchObject({ width: 9, height: 4 });
    // 8 px / 8 = 1 → at least 2; 16 px / 16 = 1 → at least 3.
    expect(g.spacing).toEqual({ node: 2, rank: 3, edge: 1 });
    // The drawer trims the margin, so cells use the profile's 0, not 8 px → 1 (#47, D84).
    expect(g.diagramPadding).toBe(0);
    const roomy = await build(prepared, cellProfile('roomy'));
    expect(roomy.nodes.find((n) => n.id === 'A')).toMatchObject({ width: 9, height: 5 });
  });

  it('turns rank spacing along x for a left-to-right flowchart', async () => {
    const prepared = await createMermaid().prepare('flowchart LR\n  A --> B\n');
    const g = await build(prepared, cellProfile());
    // v12 defaults: node 50 px / 16 → 3, rank 50 px / 8 → 6.
    expect(g.spacing).toEqual({ node: 3, rank: 6, edge: 1 });
  });
});

describe('flowchart graph builder with the px profile', () => {
  it('hands the engine the px metrics and no grid', async () => {
    let graph: LayoutGraph | undefined;
    const m = createMermaid();
    m.initialize({ deterministic: true });
    m.registerLayoutLoaders([
      {
        name: 'layered',
        loader: () =>
          Promise.resolve((g: LayoutGraph) => {
            graph = g;
            return layered(g);
          }),
      },
    ]);
    await m.render('mermaid-0', 'flowchart TD\n  A --> B\n');
    expect(graph?.metrics).toBe(pxProfile.engine);
    expect(graph?.grid).toBeUndefined();
  });
});
