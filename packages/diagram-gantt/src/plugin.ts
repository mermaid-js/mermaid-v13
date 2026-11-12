import type { DiagramParseContext, RenderContext } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import type { GanttPlugin } from './index.ts';
import { layoutGantt, type GanttLayout } from './layout/index.ts';
import type { GanttModel } from './model.ts';
import { withCallbackClaims } from './parser/callbacks.ts';
import { detectGantt, parseGantt } from './parser/index.ts';
import { renderGantt } from './render/index.ts';
import { ganttLabels } from './labels.ts';
import { theme } from './theme/table.ts';

/**
 * The gantt plugin (DESIGN §12.1, spec #293): `layoutKind: 'custom'` with its own
 * `GanttLayout`. `parse` keeps the raw model (D274); `layout` schedules it at `ctx.now` and
 * places everything; `render` writes the whole `<svg>` document. SVG only (D216). The registry
 * loads it from the package's `mermaid` manifest (#385). No `configDefaults`: the layout's
 * metrics hold v12's lengths, so an unset key takes v12's effective value.
 */
export const gantt = {
  id: 'gantt',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectGantt(text),
  parse: (text: string, ctx: DiagramParseContext) =>
    withCallbackClaims(
      parseGantt(text, {
        preprocessed: ctx.preprocessed,
        maxNodes: (ctx.limits ?? resolveLimits(ctx.config)).maxNodes,
      }),
      ctx.claims
    ),
  labels: ganttLabels,
  layout: (model: GanttModel, ctx: RenderContext): GanttLayout => layoutGantt(model, ctx),
  render: (model: GanttModel, layout: GanttLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderGantt(model, layout, ctx, w),
  theme,
} satisfies GanttPlugin;
