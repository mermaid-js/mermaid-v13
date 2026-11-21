import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { CORE_DEFAULTS, resolveConfig } from '@mermaid-js/core/config';
import {
  cellProfile,
  countCrossings,
  layered,
  pxProfile,
  validateGrid,
  validateLayout,
  type LayoutGraph,
  type LayoutModel,
  type UnitProfile,
} from '@mermaid-js/core/layout';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { DIAGRAM_TABLES } from './diagram-themes.ts';
import { detectEr, layoutEr, parseEr, type ErModel } from '@mermaid-js/diagram-er';
import { REPO_ROOT, corpusFromDir } from './index.ts';
import { layoutLengths } from './layout-lengths.ts';

// DDLT-style checks on parser-produced ER graphs (DESIGN §6.2, #132): every e2e ER fixture the
// v13 parser accepts, measured and built by the ER graph builder under the px and the cell unit
// profile (ADR-13), laid out by `layered`. The graph is the one the builder hands `ctx.layout`.
// Every model must be valid (no NaN, no overlaps, containment, labels clear of boxes); in cells
// it must also lie on the grid. Crossing counts are snapshotted.

const models: { id: string; model: ErModel }[] = [];

beforeAll(async () => {
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/er-diagram'), 'er')) {
    if (!detectEr(item.source)) continue;
    const { model, diagnostics } = parseEr(item.source);
    if (diagnostics.some((d) => d.severity === 'error')) continue;
    models.push({ id: item.id, model });
  }
}, 60_000);

const theme = createTheme(await loadTheme('redux'), { diagram: DIAGRAM_TABLES.er });
const config = resolveConfig(CORE_DEFAULTS);

function build(model: ErModel, units: UnitProfile): { graph: LayoutGraph; laid: LayoutModel } {
  let graph: LayoutGraph | undefined;
  let laid: LayoutModel | undefined;
  layoutEr(model, {
    config,
    measurer: units.id === 'cell' ? cellMeasurer : tableMeasurer,
    units,
    theme,
    warn: () => {},
    layout: (g) => {
      graph = g;
      return (laid = layered(g));
    },
  });
  return { graph: graph!, laid: laid! };
}

describe('layered over parser-produced ER graphs', () => {
  it('reads the corpus', () => {
    expect(models.length).toBeGreaterThan(180);
    // Subgraphs, relationships to subgraphs and attribute tables are all in it.
    expect(models.some(({ model }) => model.subgraphs.length > 1)).toBe(true);
    expect(models.some(({ model }) => model.relationships.some((r) => r.to.subgraph))).toBe(true);
  });

  for (const [name, units] of [
    ['px', pxProfile],
    ['cell', cellProfile()],
  ] as const) {
    it(`lays out every corpus graph validly with the ${name} profile`, () => {
      const crossings: Record<string, number> = {};
      const bad: Record<string, string[]> = {};
      for (const { id, model } of models) {
        const { graph, laid } = build(model, units);
        // In px a self-loop clears its two ends (36 out, the zero circle behind a crow's foot,
        // plus loopGap 6) and ends along a side are a mark's 18 plus minPitch 8 apart (#124).
        if (units.grid === undefined)
          expect(graph.metrics, id).toEqual({ ...units.engine, loop: 42, portPitch: 26 });
        else expect(graph.metrics, id).toBe(units.engine);
        expect(graph.grid, id).toBe(units.grid);
        const problems = validateLayout(graph, laid);
        if (units.grid !== undefined) problems.push(...validateGrid(graph, laid));
        if (problems.length > 0) bad[id] = problems;
        crossings[id] = countCrossings(laid);
      }
      expect(bad).toEqual({});
      expect(crossings).toMatchSnapshot();
    }, 120_000);

    // #189: a subgraph related to itself reserves room for its loop inside the drawing.
    it(`lays out a subgraph self-loop validly with the ${name} profile`, () => {
      const { model, diagnostics } = parseEr(
        'erDiagram\n  subgraph G\n  A\n  end\n  G ||--o{ G : nests\n  A ||--|| B : x'
      );
      expect(diagnostics).toEqual([]);
      const { graph, laid } = build(model, units);
      const problems = validateLayout(graph, laid);
      if (units.grid !== undefined) problems.push(...validateGrid(graph, laid));
      expect(problems).toEqual([]);
    });
  }

  it('gives every LayoutGraph length as a whole number of cells', () => {
    const bad: string[] = [];
    for (const { id, model } of models) {
      for (const [path, v] of layoutLengths(build(model, cellProfile()).graph))
        if (!Number.isInteger(v) || v < 0) bad.push(`${id}: ${path} = ${v}`);
    }
    expect(bad).toEqual([]);
  });
});
