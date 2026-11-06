import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutTimeline, type TimelineLayout } from './layout/index.ts';
import type { TimelineModel } from './model.ts';
import { detectTimeline, parseTimeline, type TimelineParseResult } from './parser/index.ts';
import { renderTimeline } from './render/index.ts';
import { timelineLabels } from './labels.ts';
import { theme } from './theme/table.ts';

/**
 * The timeline plugin (DESIGN §12.1, spec #291): `layoutKind: 'custom'` with its own
 * `TimelineLayout`, LR and TD. `parse` takes the whole source; `layout` measures and places
 * everything; `render` writes the whole `<svg>` document. SVG only (D216). The registry loads
 * it from the package's `mermaid` manifest (#315). No `configDefaults`: the layout's metrics
 * hold v12's lengths, so an unset key takes v12's effective value.
 */
export const timeline = {
  id: 'timeline',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectTimeline(text),
  parse: (text: string, ctx: DiagramParseContext): TimelineParseResult =>
    parseTimeline(text, { preprocessed: ctx.preprocessed }),
  labels: timelineLabels,
  theme,
  layout: (model: TimelineModel, ctx: RenderContext): TimelineLayout => layoutTimeline(model, ctx),
  render: (model: TimelineModel, layout: TimelineLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderTimeline(model, layout, ctx, w),
} satisfies DiagramPlugin<TimelineModel, TimelineLayout>;
