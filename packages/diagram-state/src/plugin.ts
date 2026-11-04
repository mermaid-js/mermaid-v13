import type { DiagramParseContext, DiagramPlugin } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutState, type StateLayout, type StateRenderContext } from './layout/index.ts';
import { detectState, parseState } from './parser/index.ts';
import type { StateModel, StateParseResult } from './parser/index.ts';
import { renderState } from './render/render.ts';
import { stateConfigDefaults } from './generated/config-defaults.ts';

/**
 * The state diagram plugin (DESIGN §12.1): `stateDiagram` and `stateDiagram-v2`, one renderer
 * (D101). `parse` takes the whole source (front matter included); `layout` measures and lays
 * out (#144); `render` writes the whole `<svg>` document into the writer (#146). Registered by
 * the package's `mermaid` manifest (#148); `configDefaults` are the `state` section's v12 defaults.
 */
export const state = {
  id: 'state',
  aliases: ['stateDiagram', 'stateDiagram-v2'] as readonly string[],
  formats: ['svg'] as const,
  layoutKind: 'graph' as const,
  configDefaults: stateConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectState(text),
  parse: (text: string, ctx: DiagramParseContext): StateParseResult =>
    parseState(text, {
      preprocessed: ctx.preprocessed,
      maxDepth: (ctx.limits ?? resolveLimits(ctx.config)).maxDepth,
    }),
  layout: (model: StateModel, ctx: StateRenderContext): StateLayout => layoutState(model, ctx),
  render: (model: StateModel, layout: StateLayout, ctx: StateRenderContext, w: SvgWriter): void =>
    renderState(model, layout, ctx, w),
} satisfies DiagramPlugin<StateModel, StateLayout>;
