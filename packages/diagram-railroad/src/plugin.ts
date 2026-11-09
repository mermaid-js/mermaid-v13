import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutRailroad, type RailroadLayout } from './layout/index.ts';
import type { RailroadModel } from './model.ts';
import { detectRailroad, parseRailroad, type RailroadParseResult } from './parser/index.ts';
import { renderRailroad } from './render/index.ts';
import { theme } from './theme/table.ts';

/**
 * The railroad diagram plugin (DESIGN §12.1, spec #526): one plugin for v12's four types (D511),
 * `railroad` (IR) with `railroadEbnf`, `railroadAbnf` and `railroadPeg` as its aliases, as
 * flowchart's (`diagram-flowchart/src/plugin.ts`), all four reading the one `railroad` config
 * section. `layoutKind: 'custom'` with its own `RailroadLayout`. `parse` reads the notation its
 * header names; `layout` measures and places everything as v12 did; `render` writes the whole
 * `<svg>` document. The registry loads it from the package's `mermaid` manifest once T5 (#615)
 * adds it, with the section's generated defaults in place of `configDefaults: {}` (D515: the
 * colours and fonts have none).
 */
export const railroad = {
  id: 'railroad',
  aliases: ['railroadEbnf', 'railroadAbnf', 'railroadPeg'] as readonly string[],
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configDefaults: {} as Readonly<Record<string, unknown>>,
  theme,
  detector: (text: string): boolean => detectRailroad(text) !== undefined,
  parse: (text: string, ctx: DiagramParseContext): RailroadParseResult =>
    parseRailroad(text, {
      preprocessed: ctx.preprocessed,
      maxDepth: (ctx.limits ?? resolveLimits(ctx.config)).maxDepth,
    }),
  layout: (model: RailroadModel, ctx: RenderContext): RailroadLayout => layoutRailroad(model, ctx),
  render: (model: RailroadModel, layout: RailroadLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderRailroad(model, layout, ctx, w),
} satisfies DiagramPlugin<RailroadModel, RailroadLayout>;
