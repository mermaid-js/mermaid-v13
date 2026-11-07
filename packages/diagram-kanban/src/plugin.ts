import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { kanbanLayoutInput, layoutKanban, type KanbanLayout } from './layout/index.ts';
import type { KanbanModel } from './model.ts';
import { parseKanban, type KanbanParseResult } from './parser/index.ts';
import { renderKanban } from './render/render.ts';
import { theme } from './theme/table.ts';
import { kanbanConfigDefaults } from './generated/config-defaults.ts';

/** v12's detector (`detector.ts:9`): case-sensitive, no word boundary. */
const DETECT = /^\s*kanban/;

/** Every text the layout hands to core's label layout (D176): titles, tickets and assignees. */
export function kanbanLabels(model: KanbanModel): string[] {
  const out: string[] = [];
  for (const c of model.columns) {
    out.push(model.items[c.item]!.label);
    for (const k of c.cards) {
      const card = model.items[k]!;
      out.push(card.label);
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
