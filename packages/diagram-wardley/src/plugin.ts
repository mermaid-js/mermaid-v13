import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutWardley, type WardleyLayout } from './layout/index.ts';
import type { WardleyModel } from './model.ts';
import { detectWardley, parseWardley, type WardleyParseResult } from './parser/index.ts';
import { renderWardley } from './render/index.ts';
import { theme } from './theme/table.ts';

/**
 * The Wardley map plugin (DESIGN §12.1, spec #430): `layoutKind: 'custom'` with its own
 * `WardleyLayout`. `parse` takes the whole source; `layout` measures and places everything on
 * v12's canvas; `render` writes the whole `<svg>` document. SVG only (D320): `ascii` throws
 * `UnsupportedFormatError`. Every text is one literal line (v12's `.text()`), so no label
 * extension reads it and there is no `labels` hook.
 *
 * `theme` is wardley's own table (`theme/table.ts`, D322, D331) over the thirteen `wardley*`
 * variables of `theme/vocabulary.ts`. The manifest, the registry row and the generated
 * `configDefaults` come with T5 (#497).
 */
export const wardley = {
  id: 'wardley',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectWardley(text),
  parse: (text: string, ctx: DiagramParseContext): WardleyParseResult =>
    parseWardley(text, { preprocessed: ctx.preprocessed }),
  layout: (model: WardleyModel, ctx: RenderContext): WardleyLayout => layoutWardley(model, ctx),
  render: (model: WardleyModel, layout: WardleyLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderWardley(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<WardleyModel, WardleyLayout>;
