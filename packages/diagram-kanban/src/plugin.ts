import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { kanbanLayoutInput, layoutKanban, type KanbanLayout } from './layout/index.ts';
import type { KanbanModel } from './model.ts';
import { parseKanban, type KanbanParseResult } from './parser/index.ts';
import { renderKanban } from './render/render.ts';
import { theme } from './theme/table.ts';

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
 * The kanban plugin (spec #424): `layoutKind: 'custom'` with its own `KanbanLayout`. `layout`
 * measures and places everything; `render` writes the whole `<svg>` document. The manifest and
 * `configDefaults` are T5's (#459).
 */
export const kanban = {
  id: 'kanban',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  theme,
  detector: (text: string): boolean => DETECT.test(text),
  parse: (text: string, ctx: DiagramParseContext): KanbanParseResult =>
    parseKanban(text, { preprocessed: ctx.preprocessed }),
  labels: kanbanLabels,
  layout: (model: KanbanModel, ctx: RenderContext): KanbanLayout =>
    layoutKanban(kanbanLayoutInput(model), ctx),
  render: (model: KanbanModel, layout: KanbanLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderKanban(model, layout, ctx, w),
} satisfies DiagramPlugin<KanbanModel, KanbanLayout>;
