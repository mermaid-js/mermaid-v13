import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutWardley, type WardleyLayout } from './layout/index.ts';
import type { WardleyModel } from './model.ts';
import { detectWardley, parseWardley, type WardleyParseResult } from './parser/index.ts';
import { renderWardley } from './render/index.ts';
import { theme } from './theme/table.ts';
import { WARDLEY_SECTION } from './config.ts';
import { wardleyBetaConfigDefaults } from './generated/config-defaults.ts';

/**
 * The Wardley map plugin (DESIGN §12.1, spec #430): `layoutKind: 'custom'` with its own
 * `WardleyLayout`. `parse` takes the whole source; `layout` measures and places everything on
 * v12's canvas; `render` writes the whole `<svg>` document. SVG only (D320): `ascii` throws
 * `UnsupportedFormatError`. Every text is one literal line (v12's `.text()`), so no label
 * extension reads it and there is no `labels` hook.
 *
 * `theme` is wardley's own table (`theme/table.ts`, D322, D331) over the thirteen `wardley*`
 * variables of `theme/vocabulary.ts`. The registry loads it from the package's `mermaid` manifest
 * (#497). Its options are v12's `wardley-beta` section (`configSection`, D421), whose generated
 * defaults are `configDefaults`.
 */
export const wardley = {
  id: 'wardley',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configSection: WARDLEY_SECTION,
  configDefaults: wardleyBetaConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectWardley(text),
  parse: (text: string, ctx: DiagramParseContext): WardleyParseResult => {
    const { maxNodes, maxEdges } = ctx.limits ?? resolveLimits(ctx.config);
    return parseWardley(text, { preprocessed: ctx.preprocessed, maxNodes, maxEdges });
  },
  layout: (model: WardleyModel, ctx: RenderContext): WardleyLayout => layoutWardley(model, ctx),
  render: (model: WardleyModel, layout: WardleyLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderWardley(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<WardleyModel, WardleyLayout>;
