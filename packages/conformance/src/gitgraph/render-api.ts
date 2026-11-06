import type { RenderContext } from '@mermaid-js/core';
import { gitGraph } from '@mermaid-js/diagram-gitgraph';
import { gitThemeStandIn, type GitThemeFamily } from '@mermaid-js/diagram-gitgraph/testing';
import { createMermaid, type Mermaid, type MermaidConfig } from 'mermaid';

/**
 * The theme family of each built-in theme, for the stand-in below: what a theme's own entries
 * will say once the gitGraph theme variables are in core (T5 #374), or keyed by family trait
 * (D331). Test code only: the package never names a theme (D152).
 */
const FAMILY: Readonly<Record<string, GitThemeFamily>> = {
  neo: 'neo',
  'neo-dark': 'neo',
  redux: 'redux',
  'redux-dark': 'redux',
  'redux-color': 'redux',
  'redux-dark-color': 'redux',
};

/** `ctx` with its theme answering the gitGraph variables as its family does. */
const standIn = (ctx: RenderContext): RenderContext => ({
  ...ctx,
  theme: gitThemeStandIn(ctx.theme, FAMILY[ctx.theme.name] ?? 'classic'),
});

/**
 * The gitGraph plugin as the tests register it: until T5 (#374) adds the geometry and paint
 * variables to core, a theme does not know them and the plugin draws the classic values, so
 * this copy hands layout and render a theme that knows them (`gitThemeStandIn`). T5 drops the
 * stand-in and registers `gitGraph` itself; the specs then pass unchanged.
 */
export const gitGraphForTest: typeof gitGraph = {
  ...gitGraph,
  layout: (model, ctx) => gitGraph.layout(model, standIn(ctx)),
  render: (model, layout, ctx, w) => gitGraph.render(model, layout, standIn(ctx), w),
};

/**
 * A fresh `mermaid` API object (`deterministic: true`) that renders git graphs before the
 * package is in the generated registry (#374): the plugin takes over the first-party `gitGraph`
 * row (`replace: true`), so detection, config and every range are as they will be once it is
 * registered. Optionally in `theme` or any other config.
 */
export async function gitApi(config: MermaidConfig = {}): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  await m.registerExternalDiagrams([gitGraphForTest], { lazyLoad: false, replace: true });
  return m;
}
