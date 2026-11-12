import type { DiagramParseContext, DiagramPlugin, RenderContext, Warning } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import type { QuadrantModel } from './model.ts';
import { quadrantChartConfigDefaults } from './generated/config-defaults.ts';
import { layoutQuadrant, type QuadrantLayout } from './layout/index.ts';
import { quadrantLayoutConfig } from './config.ts';
import { detectQuadrant, parseQuadrant, type QuadrantParseResult } from './parser/index.ts';
import { quadrantLabels } from './labels.ts';
import { renderQuadrant } from './render/index.ts';
import { theme } from './theme/table.ts';

/**
 * The quadrant chart plugin (DESIGN §12.1, spec #289): `layoutKind: 'custom'` with its own
 * `QuadrantLayout`. `parse` takes the whole source; `layout` places every anchor as v12's
 * builder did, over the resolved `quadrantChart` config, each value checked (`config.ts`, D226); `render` measures the labels and writes
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
    parseQuadrant(text, {
      preprocessed: ctx.preprocessed,
      maxNodes: (ctx.limits ?? resolveLimits(ctx.config)).maxNodes,
    }),
  labels: quadrantLabels,
  theme,
  layout: (model: QuadrantModel, ctx: RenderContext): QuadrantLayout => {
    const warn = (w: Warning): void => ctx.warn(w);
    const section = ctx.config.quadrantChart as Readonly<Record<string, unknown>> | undefined;
    return layoutQuadrant(model, quadrantLayoutConfig(section, warn), warn);
  },
  render: (model: QuadrantModel, layout: QuadrantLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderQuadrant(model, layout, ctx, w),
} satisfies DiagramPlugin<QuadrantModel, QuadrantLayout>;
