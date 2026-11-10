import { describe, expect, it } from 'vitest';
import type { DiagramPlugin } from '@mermaid-js/core';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { CORE_DEFAULTS, resolveConfig } from '@mermaid-js/core/config';
import { cellProfile, layered } from '@mermaid-js/core/layout';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { parseFlowchart } from '../parser/index.ts';
import { flowchart } from '../plugin.ts';
import type { FlowRenderContext } from './context.ts';
import { prepare } from './prepare.ts';
import { layoutFlowchart } from './render.ts';

const { theme: diagramTheme }: Pick<DiagramPlugin, 'id' | 'theme'> = flowchart;

function freeze(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}

async function context(cells = false): Promise<FlowRenderContext> {
  return {
    config: resolveConfig(CORE_DEFAULTS, {}),
    theme: createTheme(await loadTheme('default'), { diagram: diagramTheme }),
    measurer: cells ? cellMeasurer : tableMeasurer,
    ...(cells ? { units: cellProfile() } : {}),
    warn: () => {},
  };
}

const SOURCE = `flowchart LR
subgraph outer[Outer]
  subgraph inner[Inner]
    A[Alpha] --> B((Beta))
  end
  C[Gamma]
end
D[Delta] --> A
classDef marked fill:red,font-size:20px
class inner marked
style A fill:blue
`;

describe('flowchart preparation ownership and order', () => {
  it.each([false, true])(
    'keeps views independent from graph records (cells: %s)',
    async (cells) => {
      const model = parseFlowchart(SOURCE).model;
      const before = JSON.stringify(model);
      freeze(model);
      const prepared = prepare(model, await context(cells));
      expect(JSON.stringify(model)).toBe(before);
      expect([...prepared.views.keys()]).toEqual(['inner', 'outer', 'A', 'B', 'C', 'D']);
      expect(prepared.groups.map((g) => g.id)).toEqual(['outer', 'inner']);
      expect(prepared.graph.groups.map((g) => g.id)).toEqual(['outer', 'inner']);
      expect(prepared.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C', 'D']);
      const view = prepared.views.get('A')!;
      const snapshot = { ...view };
      const node = prepared.graph.nodes.find((n) => n.id === 'A')!;
      expect(node).not.toBe(view);
      expect(Object.keys(node)).toEqual(
        cells
          ? ['id', 'width', 'height', 'shape', 'parent']
          : ['id', 'width', 'height', 'shape', 'parent', 'span']
      );
      node.id = 'changed';
      node.width = 999;
      node.shape = 'circle';
      node.parent = 'changed';
      prepared.graph.nodes.reverse();
      prepared.graph.groups[0]!.padding.top = 999;
      expect(view).toStrictEqual(snapshot);
      expect(JSON.stringify(model)).toBe(before);
      const again = prepare(model, await context(cells));
      expect(again.nodes).toStrictEqual(prepared.nodes);
      expect(again.groups).toStrictEqual(prepared.groups);
      expect(again.nodes[0]).not.toBe(prepared.nodes[0]);
    }
  );

  it('retains measured node identities when a custom measurer changes the model', async () => {
    const model = parseFlowchart('flowchart LR\nA[Alpha] --> B[Beta]').model;
    const identities = model.vertices.map((v) => ({ id: v.id, ast: v.ast }));
    let changed = false;
    const prepared = prepare(model, {
      ...(await context()),
      measurer: {
        id: 'model-changing-measurer',
        width(text, font, style) {
          if (!changed) {
            changed = true;
            for (const vertex of model.vertices) {
              vertex.id = 'changed';
              vertex.ast = 'changed';
              vertex.type = 'circle';
            }
          }
          return tableMeasurer.width(text, font, style);
        },
        metrics: (font) => tableMeasurer.metrics(font),
      },
    });
    expect(changed).toBe(true);
    expect(prepared.nodes.map(({ id, ast }) => ({ id, ast }))).toEqual(identities);
    expect(prepared.nodes.map((n) => n.shape)).toEqual(['rect', 'rect']);
    expect(prepared.graph.nodes.map((n) => n.id)).toEqual(['A', 'B']);
    expect([...prepared.views.keys()]).toEqual(['A', 'B']);
  });

  it('captures subgraph palette order after style warning callbacks', async () => {
    const model = parseFlowchart('flowchart TB\nsubgraph G[Group]\nA\nend').model;
    const group = model.subgraphs[0]!;
    group.classes = ['invalid-style'];
    model.classes.push({ id: 'invalid-style', styles: ['invalid-property:yes'], textStyles: [] });
    let warned = false;
    const prepared = prepare(model, {
      ...(await context()),
      warn() {
        warned = true;
        group.id = 'renamed';
      },
    });
    expect(warned).toBe(true);
    expect(prepared.groups[0]!.id).toBe('G');
    expect(prepared.groups[0]!.order).toBeUndefined();
    expect(prepared.views.get('renamed')).toBe(prepared.groups[0]);
    expect(prepared.graph.groups[0]!.id).toBe('G');
  });

  it('keeps a custom engine from changing the renderer views', async () => {
    const model = parseFlowchart(SOURCE).model;
    const ctx = await context();
    const normal = layoutFlowchart(model, ctx);
    const changed = layoutFlowchart(model, {
      ...(await context()),
      layout(graph) {
        const result = layered(graph);
        for (const n of graph.nodes) {
          n.id = 'changed';
          n.shape = 'circle';
          n.width = 999;
          n.parent = 'changed';
        }
        for (const e of graph.edges) {
          e.source = 'changed';
          if (e.label) e.label.width = 999;
        }
        graph.nodes.reverse();
        return result;
      },
    });
    expect(changed.flow!.nodes).toStrictEqual(normal.flow!.nodes);
    expect(changed.flow!.edges).toStrictEqual(normal.flow!.edges);
    expect(changed.flow!.groups).toStrictEqual(normal.flow!.groups);
    expect([...changed.flow!.views]).toStrictEqual([...normal.flow!.views]);
  });
});
