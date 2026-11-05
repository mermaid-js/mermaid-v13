import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import type { QuadrantModel } from './model.ts';
import { quadrantChartConfigDefaults } from './generated/config-defaults.ts';
import { layoutQuadrant, type QuadrantLayout, type QuadrantLayoutConfig } from './layout/index.ts';
import { detectQuadrant, parseQuadrant, type QuadrantParseResult } from './parser/index.ts';
import { quadrantLabels } from './labels.ts';
import { renderQuadrant } from './render/index.ts';

/**
 * The quadrant chart plugin (DESIGN §12.1, spec #289): `layoutKind: 'custom'` with its own
 * `QuadrantLayout`. `parse` takes the whole source; `layout` places every anchor as v12's
 * builder did, over the resolved `quadrantChart` config; `render` measures the labels and writes
 * the whole `<svg>` document. SVG only: `format: 'ascii'` throws `UnsupportedFormatError`
 * (D216). #317 registers it through the package's `mermaid` manifest.
 */
export const quadrant = {
  id: 'quadrantChart',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configDefaults: quadrantChartConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectQuadrant(text),
  parse: (text: string, ctx: DiagramParseContext): QuadrantParseResult =>
    parseQuadrant(text, { preprocessed: ctx.preprocessed }),
  labels: quadrantLabels,
  layout: (model: QuadrantModel, ctx: RenderContext): QuadrantLayout =>
    layoutQuadrant(
      model,
      { ...quadrantChartConfigDefaults, ...ctx.config.quadrantChart } as QuadrantLayoutConfig,
      (w) => ctx.warn(w)
    ),
  render: (model: QuadrantModel, layout: QuadrantLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderQuadrant(model, layout, ctx, w),
} satisfies DiagramPlugin<QuadrantModel, QuadrantLayout>;
