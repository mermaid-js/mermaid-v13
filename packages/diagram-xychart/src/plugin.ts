import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { xyChartLabels } from './labels.ts';
import { layoutXyChart, type XyChartLayout } from './layout/index.ts';
import type { XyChartModel } from './model.ts';
import { detectXyChart, parseXyChart, type XyChartParseResult } from './parser/index.ts';
import { renderXyChart } from './render/index.ts';
import { theme } from './theme/table.ts';

/**
 * The XY chart plugin (DESIGN §12.1, spec #426): `layoutKind: 'custom'` with its own
 * `XyChartLayout`. `parse` takes the whole source; `layout` measures and places everything on
 * v12's canvas; `render` writes the whole `<svg>` document. SVG only (D320). Options are the
 * `xyChart` config section.
 *
 * `theme` is the XY chart's own table (`theme/table.ts`, D322, D331) over the thirteen
 * `xyChart*` variables of `theme/vocabulary.ts`. The manifest and the generated
 * `configDefaults` are T5's (#513).
 */
export const xychart = {
  id: 'xychart',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectXyChart(text),
  parse: (text: string, ctx: DiagramParseContext): XyChartParseResult =>
    parseXyChart(text, { preprocessed: ctx.preprocessed }),
  labels: xyChartLabels,
  layout: (model: XyChartModel, ctx: RenderContext): XyChartLayout => layoutXyChart(model, ctx),
  render: (model: XyChartModel, layout: XyChartLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderXyChart(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<XyChartModel, XyChartLayout>;
