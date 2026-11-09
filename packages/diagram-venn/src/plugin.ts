import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { vennPluginDefaults } from './config.ts';
import { vennConfigDefaults } from './generated/config-defaults.ts';
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
 * (`theme/table.ts`, D331). The registry loads it from the package's `mermaid` manifest (#501).
 * `configDefaults` are the `venn` section's generated defaults without `padding`
 * (`vennPluginDefaults`, D412), so a padding the layout sees is an author's; they carry v12's
 * `venn.theme` default, `redux-color`, which a `theme` from `initialize()` or the text beats.
 */
export const venn = {
  id: 'venn',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configDefaults: vennPluginDefaults(vennConfigDefaults as Readonly<Record<string, unknown>>),
  detector: (text: string): boolean => detectVenn(text),
  parse: (text: string, ctx: DiagramParseContext): VennParseResult =>
    parseVenn(text, { preprocessed: ctx.preprocessed }),
  labels: vennLabels,
  layout: (model: VennModel, ctx: RenderContext): VennLayout => layoutVenn(model, ctx),
  render: (model: VennModel, layout: VennLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderVenn(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<VennModel, VennLayout>;
