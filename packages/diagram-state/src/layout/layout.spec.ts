import type { DiagramPlugin } from '@mermaid-js/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import {
  cellProfile,
  layered,
  pxProfile,
  validateLayout,
  type LayoutGraph,
  type LayoutModel,
  type UnitProfile,
} from '@mermaid-js/core/layout';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import {
  layoutState,
  parseState,
  type CompleteStateLayout,
  type StateRenderContext,
} from '../index.ts';
import { state as diagramPlugin } from '../plugin.ts';

/** The diagram's own theme table (D331), passed to `createTheme` as the pipeline does. */
const { theme: diagramTheme }: Pick<DiagramPlugin, 'id' | 'theme'> = diagramPlugin;

// The state graph builder (#144) at its seam: StateModel → LayoutGraph → LayoutModel. The
// context records the graph the builder hands the engine.

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('redux');
});

interface Run {
  graph: LayoutGraph;
  model: LayoutModel;
  layout: CompleteStateLayout;
}

function run(src: string, options: { units?: UnitProfile; config?: ConfigInput } = {}): Run {
  let graph: LayoutGraph | undefined;
  let model: LayoutModel | undefined;
  const ctx: StateRenderContext = {
    config: resolveConfig(CORE_DEFAULTS, options.config),
    measurer: options.units?.id === 'cell' ? cellMeasurer : tableMeasurer,
    units: options.units ?? pxProfile,
    theme: createTheme(spec, { diagram: diagramTheme }),
    warn: () => {},
    layout: (g) => {
      graph = g;
      model = layered(g);
      return model;
    },
  };
  const layout = layoutState(parseState(src).model, ctx);
  return { graph: graph!, model: model!, layout };
}

const node = (g: LayoutGraph, id: string) => g.nodes.find((n) => n.id === id);
const group = (g: LayoutGraph, id: string) => g.groups.find((n) => n.id === id);

describe('state graph builder', () => {
  it('measures states and pseudo-states and lays them out with ctx.layout', () => {
    const { graph, model, layout } = run(
      'stateDiagram-v2\n  [*] --> Still\n  Still --> [*] : done\n'
    );
    expect(graph.nodes.map((n) => [n.id, n.parent])).toEqual([
      ['root_start', undefined],
      ['Still', undefined],
      ['root_end', undefined],
    ]);
    expect(node(graph, 'root_start')).toMatchObject({ width: 14, height: 14 });
    // A short label is widened to `state.minNodeWidth` (120), plus the state padding.
    expect(node(graph, 'Still')!.width).toBe(136);
    expect(graph.edges.map((e) => [e.id, e.source, e.target, !!e.label])).toEqual([
      ['edge0', 'root_start', 'Still', false],
      ['edge1', 'Still', 'root_end', true],
    ]);
    expect(validateLayout(graph, model)).toEqual([]);
    expect(layout.nodes).toBe(model.nodes);
  });

  it('makes a composite a titled group with its own direction; transitions to it end at the group', () => {
    const { graph, model } = run(
      'stateDiagram-v2\n  direction LR\n  A --> X\n  state X {\n    direction TB\n    [*] --> B\n  }\n  state Y {\n    C\n  }\n'
    );
    expect(group(graph, 'X')).toMatchObject({ direction: 'TB' });
    expect(group(graph, 'X')!.title!.width).toBeGreaterThan(0);
    // v12's `getDir`: a composite with no `direction` is TB, whatever the diagram's.
    expect(group(graph, 'Y')).toMatchObject({ direction: 'TB' });
    expect(node(graph, 'B')!.parent).toBe('X');
    expect(graph.edges.find((e) => e.target === 'X')).toMatchObject({ source: 'A' });
    expect(validateLayout(graph, model)).toEqual([]);
  });

  it('places concurrency regions side by side and stretches their frames to the composite', () => {
    const { graph, model, layout } = run(
      'stateDiagram-v2\n  state X {\n    [*] --> A\n    A --> A2\n    A2 --> A3\n    --\n    [*] --> B\n  }\n'
    );
    const regions = ['X:region1', 'X:region2'];
    expect(regions.map((r) => group(graph, r)?.parent)).toEqual(['X', 'X']);
    expect(group(graph, 'X:region1')!.title).toBeUndefined();
    expect(node(graph, 'A')!.parent).toBe('X:region1');
    expect(validateLayout(graph, model)).toEqual([]);
    const [r1, r2] = regions.map((r) => layout.groups.get(r)!);
    // Side by side across the TB flow, in declaration order, with room for a divider.
    expect(r1!.x + r1!.width / 2).toBeLessThan(r2!.x - r2!.width / 2);
    // Stretched: both frames span the composite's inner height, whatever their content.
    expect(r1!.height).toBe(r2!.height);
    expect(r1!.y).toBe(r2!.y);
    const x = layout.groups.get('X')!;
    expect(r1!.y + r1!.height / 2).toBeCloseTo(x.y + x.height / 2);
    expect(layout.dividers).toHaveLength(1);
    const d = layout.dividers[0]!;
    expect(d).toMatchObject({ composite: 'X', x1: d.x2 });
    expect(d.x1).toBeGreaterThan(r1!.x + r1!.width / 2);
    expect(d.x1).toBeLessThan(r2!.x - r2!.width / 2);
    // The engine's own frames are not touched.
    expect(model.groups.get('X:region2')!.height).toBeLessThan(r2!.height);
  });

  it('pads a reopened composite that holds plain children beside its regions', () => {
    // The first opening puts `a` directly in X; the second adds two regions (model `group()`).
    const { graph, model } = run(
      'stateDiagram-v2\n  state X {\n    a\n  }\n  state X {\n    b\n    --\n    c\n  }\n'
    );
    const pad = pxProfile.builder.groupPad;
    expect(group(graph, 'X')!.padding).toMatchObject({ left: pad, right: pad, bottom: pad });
    const x = model.groups.get('X')!;
    const a = model.nodes.get('a')!;
    expect(a.x - a.width / 2 - (x.x - x.width / 2)).toBeGreaterThanOrEqual(pad);
  });

  it('lays out a transition between sibling regions like any other edge (D113)', () => {
    const { graph, model, layout } = run(
      'stateDiagram-v2\n  state X {\n    A1 --> A2\n    --\n    B1 --> B2\n  }\n  A2 --> B1\n'
    );
    expect(graph.edges.map((e) => [e.source, e.target])).toContainEqual(['A2', 'B1']);
    expect(validateLayout(graph, model)).toEqual([]);
    // Stacked along the flow, so the divider runs across it.
    const d = layout.dividers[0]!;
    expect(d.y1).toBe(d.y2);
  });

  it('joins a note to its state by an edge on the side asked, in the state scope', () => {
    const { graph, model, layout } = run(
      'stateDiagram-v2\n  direction LR\n  state X {\n    A\n    note right of A : to the right\n  }\n  B\n  note left of B : to the left\n'
    );
    const notes = graph.nodes.filter((n) => n.shape === 'note');
    expect(notes.map((n) => [n.id, n.parent])).toEqual([
      ['note:1', 'X'],
      ['note:2', undefined],
    ]);
    expect(graph.edges.map((e) => [e.id, e.source, e.target, e.label])).toEqual([
      ['A-note:1', 'A', 'note:1', undefined],
      ['note:2-B', 'note:2', 'B', undefined],
    ]);
    expect(validateLayout(graph, model)).toEqual([]);
    const at = (id: string) => model.nodes.get(id)!.x;
    expect(at('note:2')).toBeLessThan(at('B'));
    expect(layout.state.edges.filter((e) => e.note)).toHaveLength(2);
  });

  it('turns fork and join bars across the flow', () => {
    const tb = run('stateDiagram-v2\n  state f <<fork>>\n  [*] --> f\n').graph;
    const lr = run('stateDiagram-v2\n  direction LR\n  state f <<fork>>\n  [*] --> f\n').graph;
    expect(node(tb, 'f')).toMatchObject({ width: 70, height: 10 });
    expect(node(lr, 'f')).toMatchObject({ width: 10, height: 70 });
  });

  it('titles a described state with its first description and lists the rest below (v12 stateDb)', () => {
    const { layout } = run(
      'stateDiagram-v2\n  A : first line\n  A : second line\n  A : third line\n'
    );
    const view = layout.state.views.get('A');
    expect(view).toMatchObject({ shape: 'described' });
    if (!view || !('rows' in view) || !view.rows) throw new Error('no rows');
    const text = (lines: { text: string }[][]) => lines.map((l) => l.map((r) => r.text).join(''));
    expect(text(view.label.lines)).toEqual(['first line']);
    expect(text(view.rows.lines)).toEqual(['second line', 'third line']);
    expect(view.h).toBeGreaterThan(view.label.height + view.rows.height);
  });

  describe('a described state breaks only at a written \\n (D731, #1214)', () => {
    const long = 'Waiting for payment confirmation';
    const row = 'retries every minute until the bank answers';
    const src = `stateDiagram-v2\n  state "${long}" as W\n  W : ${row}\n  W : second row\n`;
    const text = (lines: { text: string }[][]) => lines.map((l) => l.map((r) => r.text).join(''));
    const described = (source: string, units: UnitProfile) => {
      const view = run(source, { units }).layout.state.views.get('W');
      if (!view || !('rows' in view) || !view.rows) throw new Error('not described');
      return { label: view.label, rows: view.rows };
    };

    it.each([
      ['px', pxProfile],
      ['cells', cellProfile()],
    ])('keeps the title and each row on one line in %s', (_name, units) => {
      const view = described(src, units);
      expect(text(view.label.lines)).toEqual([long]);
      expect(text(view.rows.lines)).toEqual([row, 'second row']);
    });

    it.each([
      ['px', pxProfile],
      ['cells', cellProfile()],
    ])('still breaks at a written \\n in %s', (_name, units) => {
      const view = described(
        'stateDiagram-v2\n  state "first\\nsecond" as W\n  W : row one\\nrow two\n  W : row three\n',
        units
      );
      expect(text(view.label.lines)).toEqual(['first', 'second']);
      expect(text(view.rows.lines)).toEqual(['row one', 'row two', 'row three']);
    });

    it('keeps wrapping a state with one description', () => {
      const view = run(`stateDiagram-v2\n  W : ${long} ${row}\n`).layout.state.views.get('W');
      expect(view && 'label' in view ? view.label.lines.length : 0).toBeGreaterThan(1);
    });
  });

  it('takes spacing from state config in px', () => {
    const { graph } = run('stateDiagram-v2\n  A --> B\n', {
      config: { state: { nodeSpacing: 80, rankSpacing: 90 } },
    });
    expect(graph.spacing).toMatchObject({ node: 80, rank: 90 });
  });
});
