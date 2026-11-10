// What the kanban text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per
// feature kind, naming the AST ids of the items it dropped it for, in board order. Each rule is
// the SVG renderer's own: `userClasses` for the classes it writes and `ticketUrl` for the links
// it draws. Column colours come from the theme, not the author, so they are not named; icons
// are drawn by neither output (D376).
import type { Warning } from '@mermaid-js/core';
import { Style, type MeasuredLabel } from '@mermaid-js/core/text';
import type { KanbanLayout, PlacedLabel } from '../layout/index.ts';
import { kanbanBoardOrder, type KanbanModel } from '../model.ts';
import { userClasses } from '../render/classes.ts';
import { ticketUrl, type LinkContext } from '../render/links.ts';
import { emphasised } from '@mermaid-js/core/ascii';
import { asciiDropped } from '@mermaid-js/core/ascii';

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

/** What the layout drew for one item: its labels, and a card's ticket. */
interface Drawn {
  readonly labels: readonly (PlacedLabel | undefined)[];
  readonly ticket?: PlacedLabel;
}

/**
 * The warnings for one drawing: the items the SVG gives a class, those whose text is bold or
 * italic, and the cards whose ticket the SVG links. The link check runs as in SVG, but its
 * `URL_REFUSED` is not repeated: text draws no link either way.
 */
export function asciiWarnings(
  model: KanbanModel,
  layout: KanbanLayout,
  ctx: Omit<LinkContext, 'warn'>
): AsciiWarning[] {
  const found: Record<AsciiDroppedFeature, string[]> = { style: [], emphasis: [], link: [] };
  const drawnAs = new Map<string, Drawn>();
  for (const c of layout.columns) drawnAs.set(c.ast, { labels: [c.title] });
  for (const c of layout.cards)
    drawnAs.set(c.ast, {
      labels: [c.title, c.ticket, c.assignee],
      ...(c.ticket ? { ticket: c.ticket } : {}),
    });
  // The check's own `URL_REFUSED` is the SVG's to give: text draws no link either way.
  const refused: Warning[] = [];
  const linkCtx: LinkContext = { ...ctx, warn: (w) => void refused.push(w) };
  for (const item of kanbanBoardOrder(model)) {
    const drawn = drawnAs.get(item.ast);
    if (!drawn) continue;
    if (userClasses(item.classes) !== '') found.style.push(item.ast);
    if (drawn.labels.some((l) => emphasised(l?.text))) found.emphasis.push(item.ast);
    // As `drawCard`: a drawn ticket whose URL passes the check is a link.
    if (drawn.ticket && ticketUrl(item.ticket, linkCtx)) found.link.push(item.ast);
  }
  const out: AsciiWarning[] = [];
  for (const feature of Object.keys(found) as AsciiDroppedFeature[]) {
    const astIds = found[feature];
    if (astIds.length > 0)
      out.push(asciiDropped(feature, astIds, WHAT[feature]));
  }
  return out;
}
