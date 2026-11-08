import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { vennLabels } from './labels.ts';
import { layoutVenn, type VennLayout } from './layout/index.ts';
import type { VennModel } from './model.ts';
import { detectVenn, parseVenn, type VennParseResult } from './parser/index.ts';
import { renderVenn } from './render/index.ts';
import { theme } from './theme/table.ts';

/**
 * The venn plugin (DESIGN §12.1, spec #429): `layoutKind: 'custom'` with its own `VennLayout`.
 * `parse` takes the whole source; `layout` solves the circles once (D412) and measures every
 * text; `render` writes the whole `<svg>` document. SVG only (D320: no `ascii` hook, so core
 * throws `UnsupportedFormatError` for `format: 'ascii'`). `theme` is the diagram's own table
 * (`theme/table.ts`, D331). The manifest, `configDefaults` and the registry row are #501's.
 */
export const venn = {
  id: 'venn',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectVenn(text),
  parse: (text: string, ctx: DiagramParseContext): VennParseResult =>
    parseVenn(text, { preprocessed: ctx.preprocessed }),
  labels: vennLabels,
  layout: (model: VennModel, ctx: RenderContext): VennLayout => layoutVenn(model, ctx),
  render: (model: VennModel, layout: VennLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderVenn(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<VennModel, VennLayout>;
