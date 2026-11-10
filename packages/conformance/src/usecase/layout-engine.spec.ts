import { describe, expect, it } from 'vitest';
import type { DiagramPlugin } from '@mermaid-js/core';
import {
  detectUsecase,
  layoutUsecase,
  parseUsecase,
  type UsecaseLayout,
  type UsecaseModel,
} from '@mermaid-js/diagram-usecase';
import { usecaseLayoutProblems } from '@mermaid-js/diagram-usecase/testing';
import elkLayouts from '@mermaid-js/layout-elk';
import { createMermaid } from 'mermaid';

// The engine a usecase diagram is laid out with (spec #517 T3, R-LAYOUT-7, D173, D327), through
// `createMermaid().render()`. Until T5's manifest the type has no plugin in the registry, so this
// registers one over the `usecase` id (`replace`) from the package's own parse and layout, with
// a render that only writes the node boxes, and records each layout. The plugin names no
// `layoutEngine`: `layered` is the default, `dagre` is `layered`, `elk` without the plugin
// draws `layered` with one `ELK_NOT_INSTALLED`, and `compass` is taken by name.

const SOURCE = `usecase-beta
  direction TB
  actor Customer
  systemBoundary Shop["Shop"]
    Browse("Browse catalog")
    Checkout("Place order")
  end
  Customer --> Browse
  Customer ---> Checkout
  Browse ..> : include Checkout
  note for Customer "Signed in"
`;

function plugin(seen: UsecaseLayout[]): DiagramPlugin<UsecaseModel, UsecaseLayout> {
  return {
    id: 'usecase',
    layoutKind: 'graph',
    detector: (text) => detectUsecase(text),
    parse: (text, ctx) => parseUsecase(text, { preprocessed: ctx.preprocessed }),
    layout: (model, ctx) => layoutUsecase(model, ctx),
    render: (_model, layout, ctx, w) => {
      seen.push(layout);
      w.open('svg', {
        xmlns: 'http://www.w3.org/2000/svg',
        id: ctx.idPrefix,
        viewBox: [0, 0, layout.width, layout.height],
      });
      for (const [id, n] of layout.nodes)
        w.leaf('rect', { 'data-id': id, x: n.x, y: n.y, width: n.width, height: n.height });
      w.close();
    },
  };
}

async function render(layout: string | undefined, elk = false) {
  const seen: UsecaseLayout[] = [];
  const m = createMermaid();
  m.initialize({ deterministic: true, ...(layout !== undefined ? { layout } : {}) });
  await m.registerExternalDiagrams([plugin(seen)], { replace: true });
  if (elk) m.registerLayoutLoaders(elkLayouts);
  const r = await m.render('u', SOURCE);
  expect(seen).toHaveLength(1);
  return { warnings: r.warnings.map((w) => w.code), layout: seen[0]! };
}

/** Where every node went, to compare two layouts. */
const placement = (l: UsecaseLayout) => JSON.stringify([...l.nodes]);

describe('usecase layout engines through render()', () => {
  it('lays out with layered by default, not v12 ELK (R-LAYOUT-7)', async () => {
    const byDefault = await render(undefined);
    const layered = await render('layered');
    expect(byDefault.warnings).toEqual([]);
    expect(usecaseLayoutProblems(byDefault.layout)).toEqual([]);
    expect(placement(byDefault.layout)).toBe(placement(layered.layout));
  });

  it('reads dagre as layered, with no warning', async () => {
    const dagre = await render('dagre');
    expect(dagre.warnings).toEqual([]);
    expect(placement(dagre.layout)).toBe(placement((await render('layered')).layout));
  });

  it('draws elk without the plugin with layered and one ELK_NOT_INSTALLED (D173)', async () => {
    const elk = await render('elk');
    expect(elk.warnings).toEqual(['ELK_NOT_INSTALLED']);
    expect(placement(elk.layout)).toBe(placement((await render('layered')).layout));
  });

  it('lays out with ELK when the plugin is installed', async () => {
    const elk = await render('elk', true);
    expect(elk.warnings).toEqual([]);
    expect(usecaseLayoutProblems(elk.layout)).toEqual([]);
    expect(placement(elk.layout)).not.toBe(placement((await render('layered')).layout));
  });

  it('takes compass by name, its sides from direction (D327)', async () => {
    const c = await render('compass');
    expect(c.warnings).toEqual([]);
    expect(usecaseLayoutProblems(c.layout)).toEqual([]);
    expect(placement(c.layout)).not.toBe(placement((await render('layered')).layout));
  });
});
