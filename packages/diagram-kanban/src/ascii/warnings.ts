// What the kanban text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per
// feature kind, naming the AST ids of the items it dropped it for, in board order. Column
// colours come from the theme, not the author, so they are not named; icons are drawn by
// neither output (D376).
import type { Warning } from '@mermaid-js/core';
import { Style, type MeasuredLabel } from '@mermaid-js/core/text';
import type { KanbanLayout, PlacedLabel } from '../layout/index.ts';
import type { KanbanModel } from '../model.ts';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'style' | 'emphasis' | 'link';

/** One feature kind text output dropped (D82). */
export interface AsciiDroppedWarning extends Warning {
  readonly code: 'ASCII_DROPPED';
  readonly feature: AsciiDroppedFeature;
  readonly astIds: readonly string[];
}

export type AsciiWarning = AsciiDroppedWarning;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'classes (:::)',
  emphasis: 'bold and italic text',
  link: 'ticket links (kanban.ticketBaseUrl)',
};

const emphasised = (label: MeasuredLabel | undefined): boolean =>
  label?.lines.some((line) =>
    line.some((run) => (run.style & (Style.Bold | Style.Italic)) !== 0)
  ) ?? false;

/** Whether the SVG gives the item a class: a word with a character of `[\w-]` (`render.ts`). */
const styled = (classes: readonly string[] | undefined): boolean =>
  classes?.some((c) => /[\w-]/.test(c)) ?? false;

/**
 * The warnings for one drawing: the items with `:::` classes, those whose text is bold or
 * italic, and, with a `kanban.ticketBaseUrl`, the cards whose ticket the SVG links.
 */
export function asciiWarnings(
  model: KanbanModel,
  layout: KanbanLayout,
  config: { readonly kanban?: { readonly ticketBaseUrl?: unknown } }
): AsciiWarning[] {
  const found: Record<AsciiDroppedFeature, string[]> = { style: [], emphasis: [], link: [] };
  const classes = new Map(model.items.map((item) => [item.ast, item.classes]));
  const base = config.kanban?.ticketBaseUrl;
  const linked = typeof base === 'string' && base !== '';
  const check = (ast: string, labels: readonly (PlacedLabel | undefined)[]): void => {
    if (styled(classes.get(ast))) found.style.push(ast);
    if (labels.some((l) => emphasised(l?.text))) found.emphasis.push(ast);
  };
  // `cards` is column by column: walk both in step for board order.
  let n = 0;
  layout.columns.forEach((column, k) => {
    check(column.ast, [column.title]);
    for (let card = layout.cards[n]; card?.column === k; card = layout.cards[++n]) {
      check(card.ast, [card.title, card.ticket, card.assignee]);
      if (linked && card.ticket) found.link.push(card.ast);
    }
  });
  const out: AsciiWarning[] = [];
  for (const feature of Object.keys(found) as AsciiDroppedFeature[]) {
    const astIds = found[feature];
    if (astIds.length > 0)
      out.push({
        code: 'ASCII_DROPPED',
        feature,
        astIds,
        message: `Text output has no ${WHAT[feature]}; dropped.`,
      });
  }
  return out;
}
