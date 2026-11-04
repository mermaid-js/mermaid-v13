import { describe, expect, it } from 'vitest';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import {
  cellProfile,
  layered,
  pxProfile,
  type LayoutGraph,
  type UnitProfile,
} from '@mermaid-js/core/layout';
import { CORE_DEFAULTS, resolveConfig, type MermaidConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { parseEr } from '../index.ts';
import { layoutEr, type ErLayout, type ErRenderContext } from './layout.ts';

const theme = createTheme(await loadTheme('redux'), {});

/** Lays `src` out through `ctx.layout`, keeping the graph the builder hands the engine. */
function lay(
  src: string,
  units: UnitProfile = cellProfile(),
  init?: MermaidConfig
): { graph: LayoutGraph; layout: ErLayout } {
  const { model, diagnostics } = parseEr(src);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  let graph: LayoutGraph | undefined;
  const ctx: ErRenderContext = {
    config: resolveConfig(CORE_DEFAULTS, init),
    measurer: units.id === 'cell' ? cellMeasurer : tableMeasurer,
    units,
    theme,
    warn: () => {},
    layout: (g) => {
      graph = g;
      return layered(g);
    },
  };
  const layout = layoutEr(model, ctx);
  return { graph: graph!, layout };
}

describe('entity tables in cells', () => {
  it('sizes a table as mermaid-ascii draws it: shared columns, header spread over them', () => {
    // attributes_basic: a 29 × 6 box ("string" 6+2, "*the_Primary_Key" 16+2, 3 rules).
    const { graph } = lay('erDiagram\n  BOOK {\n    string *title\n    id *the_Primary_Key\n  }\n');
    expect(graph.nodes).toEqual([expect.objectContaining({ width: 29, height: 6 })]);
  });

  it('gives keys and comments their own columns, keys joined with commas', () => {
    // attributes_keys_and_comments: 51 × 8; attributes_composite_key: 39 × 6 ("PK,FK").
    const a = lay(
      'erDiagram\nORDER {\nint id PK "unique identifier"\nint customerId FK\nstring trackingCode UK\ndecimal total "includes tax"\n}\n'
    );
    expect(a.graph.nodes[0]).toMatchObject({ width: 51, height: 8 });
    const view = a.layout.er!.entities[0]!;
    expect(view.columns.map((c) => c.size)).toEqual([9, 14, 4, 19]);
    expect(view.columns.map((c) => c.at)).toEqual([1, 11, 26, 31]);
    expect(view.rows.map((r) => r.band.at)).toEqual([3, 4, 5, 6]);
    const b = lay('erDiagram\nCAR {\nstring registrationNumber PK, FK\nstring make\n}\n');
    expect(b.graph.nodes[0]).toMatchObject({ width: 39, height: 6 });
    expect(b.layout.er!.entities[0]!.rows[0]!.cells[2].lines.length).toBe(1);
  });

  it('draws an entity with no attributes as its name in a box', () => {
    // long_entity_names: 30 × 3.
    const { graph } = lay('erDiagram\n  CUSTOMER_LOYALTY_PROGRAMME ||--o{ Q : generates\n');
    expect(graph.nodes[0]).toMatchObject({ width: 30, height: 3 });
  });

  it('spreads a wide name over the columns in use, the rest to the last', () => {
    // The name needs 18 + 2: 11 more, 5 each, +1 last.
    const { graph, layout } = lay('erDiagram\n  ABCDEFGHIJKLMNOPQR {\n    a b\n  }\n');
    expect(graph.nodes[0]).toMatchObject({ width: 22 });
    expect(layout.er!.entities[0]!.columns.map((c) => c.size)).toEqual([9, 10, 0, 0]);
  });

  it('shows generic types with angle brackets', () => {
    const { layout } = lay('erDiagram\n  A {\n    List~int~ xs\n  }\n');
    expect(layout.er!.entities[0]!.rows[0]!.cells[0].lines[0]![0]!.text).toBe('List<int>');
  });

  it('gives every length as a whole number of cells and hands the engine the grid', () => {
    const { graph } = lay('erDiagram\n  A ||--o{ B : has\n');
    expect(graph.grid).toBe(1);
    expect(graph.metrics).toBe(cellProfile().engine);
    expect(graph.headRoom).toBe(cellProfile().builder.headRoom);
    expect(graph.diagramPadding).toBe(0);
    // "has" + the label patch (2 × 0).
    expect(graph.edges[0]!.label).toEqual({ width: 5, height: 1 });
  });
});

describe('entity tables in px', () => {
  const cell = (text: string) => tableMeasurer.width(text, font(), 0);
  const font = () => ({
    family: theme.value('fontFamily'),
    size: theme.number('fontSize'),
    weight: 400,
  });
  const line = () => tableMeasurer.metrics(font()).lineHeight;

  it('pads each cell by the profile node padding, with no rule thickness', () => {
    const { graph, layout } = lay('erDiagram\n  A {\n    string name PK\n  }\n', pxProfile);
    const pad = pxProfile.builder.nodePad;
    const view = layout.er!.entities[0]!;
    expect(view.rule).toBe(0);
    expect(view.columns.map((c) => c.size)).toEqual([
      cell('string') + 2 * pad.x,
      cell('name') + 2 * pad.x,
      cell('PK') + 2 * pad.x,
      0,
    ]);
    expect(graph.nodes[0]).toMatchObject({
      width: cell('string') + cell('name') + cell('PK') + 6 * pad.x,
      height: 2 * (line() + 2 * pad.y),
    });
    expect(graph.metrics).toBe(pxProfile.engine);
    expect(graph.grid).toBeUndefined();
    expect(graph.routing).toBe('stepped');
  });

  it('pads each cell by er.entityPadding across and down, in px (D116)', () => {
    const src = 'erDiagram\n  A {\n    string name PK\n  }\n  B\n';
    const { graph, layout } = lay(src, pxProfile, { er: { entityPadding: 15 } });
    expect(layout.er!.pad).toEqual({ x: 15, y: 15 });
    expect(layout.er!.entities[0]!.columns.map((c) => c.size)).toEqual([
      cell('string') + 30,
      cell('name') + 30,
      cell('PK') + 30,
      0,
    ]);
    expect(graph.nodes[0]).toMatchObject({ height: 2 * (line() + 30) });
    // An entity without attributes: the name cell, padded the same way.
    expect(graph.nodes[1]).toMatchObject({ width: cell('B') + 30, height: line() + 30 });
    const tight = lay(src, pxProfile, { er: { entityPadding: 0 } });
    expect(tight.graph.nodes[0]).toMatchObject({
      width: cell('string') + cell('name') + cell('PK'),
      height: 2 * line(),
    });
  });

  it('keeps the 1-cell padding and no margin in cells, whatever er says (D116)', () => {
    const init = { er: { entityPadding: 40, diagramPadding: 50 } };
    const src = 'erDiagram\n  BOOK {\n    string *title\n    id *the_Primary_Key\n  }\n';
    const { graph, layout } = lay(src, cellProfile(), init);
    expect(layout.er!.pad).toEqual(cellProfile().builder.nodePad);
    expect(graph.nodes).toEqual([expect.objectContaining({ width: 29, height: 6 })]);
    expect(graph.diagramPadding).toBe(0);
  });

  it('takes er.diagramPadding as the px margin around the drawing (D116)', () => {
    const src = 'erDiagram\n  A ||--o{ B : x\n';
    expect(lay(src, pxProfile).graph.diagramPadding).toBe(pxProfile.builder.diagramPadding);
    expect(lay(src, pxProfile, { er: { diagramPadding: 20 } }).graph.diagramPadding).toBe(20);
    expect(lay(src, pxProfile, { er: { diagramPadding: 0 } }).graph.diagramPadding).toBe(0);
  });

  it('measures a name in the font its style gives it', () => {
    const plain = lay('erDiagram\n  A\n', pxProfile).graph.nodes[0]!;
    const big = lay('erDiagram\n  A\n  style A font-size:40px\n', pxProfile).graph.nodes[0]!;
    expect(big.height).toBeGreaterThan(plain.height);
  });

  it('takes er.nodeSpacing and er.rankSpacing as px config, else the profile spacing', () => {
    expect(lay('erDiagram\n  A ||--o{ B : x\n', pxProfile).graph.spacing).toEqual(
      pxProfile.builder.spacing
    );
    const g = lay('erDiagram\n  A ||--o{ B : x\n', pxProfile, {
      er: { nodeSpacing: 140, rankSpacing: 80 },
    });
    expect(g.graph.spacing).toMatchObject({ node: 140, rank: 80 });
    // In cells: 140 px / 8 across an LR flow's ranks... TB: node along x (140/8 → 18), rank along y (80/16 → 5).
    const c = lay('erDiagram\n  A ||--o{ B : x\n', cellProfile(), {
      er: { nodeSpacing: 140, rankSpacing: 80 },
    });
    expect(c.graph.spacing).toMatchObject({ node: 18, rank: 5 });
  });
});

describe('relationships and subgraphs', () => {
  it('ends a relationship on a subgraph at its group, and nests groups with their direction', () => {
    const { graph } = lay(
      [
        'erDiagram',
        'subgraph Outer [Shop]',
        '  direction LR',
        '  subgraph Inner',
        '    A ||--o{ B : has',
        '  end',
        '  C',
        'end',
        'Inner ||--|| D : owns',
      ].join('\n')
    );
    expect(graph.groups.map((g) => [g.id, g.parent, g.direction])).toEqual([
      ['s:Outer', undefined, 'LR'],
      ['s:Inner', 's:Outer', undefined],
    ]);
    expect(Object.fromEntries(graph.nodes.map((n) => [n.id, n.parent]))).toEqual({
      'n:A': 's:Inner',
      'n:B': 's:Inner',
      'n:C': 's:Outer',
      'n:D': undefined,
    });
    expect(graph.edges.map((e) => [e.id, e.source, e.target])).toEqual([
      ['e:A>B', 'n:A', 'n:B'],
      ['e:Inner>D', 's:Inner', 'n:D'],
    ]);
    expect(graph.groups[0]!.title).toEqual({ width: 4, height: 1 });
  });

  it('never makes a group its own ancestor', () => {
    // A reopened id inside itself, and two subgraphs naming each other.
    const own = lay('erDiagram\nsubgraph A\n  subgraph A\n    X\n  end\nend\n').graph;
    expect(own.groups.map((g) => [g.id, g.parent])).toEqual([
      ['s:A', undefined],
      ['s:A@2', 's:A'],
    ]);
    const mutual = lay('erDiagram\nsubgraph X\n  Y\nend\nsubgraph Y\n  X\nend\n').graph;
    expect(mutual.groups.map((g) => [g.id, g.parent])).toEqual([
      ['s:X', undefined],
      ['s:Y', 's:X'],
    ]);
  });
});
