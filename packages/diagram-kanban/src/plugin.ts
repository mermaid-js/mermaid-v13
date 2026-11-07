import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { kanbanLayoutInput, layoutKanban, type KanbanLayout } from './layout/index.ts';
import type { KanbanModel } from './model.ts';
import { parseKanban, type KanbanParseResult } from './parser/index.ts';
import { renderKanban } from './render/render.ts';
import { theme } from './theme/table.ts';
import { kanbanConfigDefaults } from './generated/config-defaults.ts';

/**
 * v12's detector (`detector.ts:9`): case-sensitive, no word boundary, on the text the pipeline
 * hands `detector` (front matter, directives and `%%` comments already removed). The generated
 * registry row has the same pattern. `detectKanban` (`parser/detect.ts`) is the same test on a
 * raw source, through `diagramStart`, for callers that hold the text before preprocessing
 * (conformance, editors).
 */
const DETECT = /^\s*kanban/;

/**
 * Every text the layout hands to core's label layout (D176): read off `kanbanLayoutInput`, so
 * it is exactly the drawn titles, tickets and assignees.
 */
function kanbanLabels(model: KanbanModel): string[] {
  const out: string[] = [];
  for (const column of kanbanLayoutInput(model).columns) {
    out.push(column.title);
    for (const card of column.cards) {
      out.push(card.title);
      if (card.ticket !== undefined) out.push(card.ticket);
      if (card.assigned !== undefined) out.push(card.assigned);
    }
  }
  return out;
}

/**
 * The kanban plugin (DESIGN §12.1, spec #424): `layoutKind: 'custom'` with its own
 * `KanbanLayout`. `parse` takes the whole source and the integrator's node limit (R-SEC-5);
 * `layout` measures and places everything; `render` writes the whole `<svg>` document. Text
 * output is the separate `./ascii` entry (#466, D320), which draws the layout in cells. The
 * registry loads it from the package's `mermaid` manifest (#459);
 * `configDefaults` are the `kanban` section's generated defaults, and `theme` is the diagram's
 * own theme table (`theme/table.ts`, D331).
 */
export const kanban = {
  id: 'kanban',
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'custom' as const,
  configDefaults: kanbanConfigDefaults as Readonly<Record<string, unknown>>,
  theme,
  detector: (text: string): boolean => DETECT.test(text),
  parse: (text: string, ctx: DiagramParseContext): KanbanParseResult =>
    parseKanban(text, {
      preprocessed: ctx.preprocessed,
      maxNodes: (ctx.limits ?? resolveLimits(ctx.config)).maxNodes,
    }),
  labels: kanbanLabels,
  layout: (model: KanbanModel, ctx: RenderContext): KanbanLayout =>
    layoutKanban(kanbanLayoutInput(model), ctx),
  render: (model: KanbanModel, layout: KanbanLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderKanban(model, layout, ctx, w),
} satisfies DiagramPlugin<KanbanModel, KanbanLayout>;
