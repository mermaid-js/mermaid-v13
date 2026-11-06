import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutPie, type PieLayout } from './layout/index.ts';
import type { PieModel } from './model.ts';
import { detectPie, parsePie, type PieParseResult } from './parser/index.ts';
import { renderPie } from './render/index.ts';
import { pieLabels } from './labels.ts';
import { pieConfigDefaults } from './generated/config-defaults.ts';

/**
 * The pie chart plugin (DESIGN §12.1, spec #288): `layoutKind: 'custom'` with its own
 * `PieLayout`. `parse` takes the whole source; `layout` measures and places everything on
 * v12's canvas; `render` writes the whole `<svg>` document. SVG only (D216). The registry
 * loads it from the package's `mermaid` manifest (#325); `configDefaults` are the `pie`
 * section's generated defaults.
 */
export const pie = {
  id: 'pie',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configDefaults: pieConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectPie(text),
  parse: (text: string, ctx: DiagramParseContext): PieParseResult =>
    parsePie(text, { preprocessed: ctx.preprocessed }),
  labels: pieLabels,
  layout: (model: PieModel, ctx: RenderContext): PieLayout => layoutPie(model, ctx),
  render: (model: PieModel, layout: PieLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderPie(model, layout, ctx, w),
} satisfies DiagramPlugin<PieModel, PieLayout>;
