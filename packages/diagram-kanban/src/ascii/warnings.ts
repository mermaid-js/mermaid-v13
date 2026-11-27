// What the kanban text output cannot show (D82, R-ASCII-5): one `ASCII_DROPPED` warning per
// feature kind, naming the AST ids of the items it dropped it for, in board order. Each rule is
// the SVG renderer's own: shared `cls` for the classes it writes and `ticketUrl` for the links
// it draws. Column colours come from the theme, not the author, so they are not named; icons
// are drawn by neither output (D376). A board's `accTitle` and `accDescr` (D742) have no text
// form either: the statements' AST ids are named when the AST is given.
import type { Warning } from '@mermaid-js/core';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import type { KanbanLayout, PlacedLabel } from '../layout/index.ts';
import { kanbanBoardOrder, type KanbanModel } from '../model.ts';
import { cls } from '@mermaid-js/shared/svg/document';
import { ticketUrl, type LinkContext } from '../render/links.ts';
import { asciiDropped, emphasised } from '@mermaid-js/shared/ascii';
import type { AsciiDroppedWarning as SharedAsciiDroppedWarning } from '@mermaid-js/shared/ascii';

/** The feature kinds an `ASCII_DROPPED` warning names, in the order they are reported. */
export type AsciiDroppedFeature = 'style' | 'emphasis' | 'link' | 'accessibility';

/** One feature kind text output dropped (D82). */
export type AsciiDroppedWarning = SharedAsciiDroppedWarning<AsciiDroppedFeature>;

export type AsciiWarning = AsciiDroppedWarning;

const WHAT: Record<AsciiDroppedFeature, string> = {
  style: 'classes (:::)',
  emphasis: 'bold and italic text',
  link: 'ticket links (kanban.ticketBaseUrl)',
  accessibility: 'accTitle and accDescr',
};

/** The ids of the `accTitle` and `accDescr` statements of `ast`, in source order. */
function accIds(ast: AstNode | undefined): string[] {
  const ids: string[] = [];
  for (const n of ast?.children ?? []) {
    if (n.type === 'AccTitle' || n.type === 'AccDescr') ids.push(n.id);
  }
  return ids;
}

/** What the layout drew for one item: its labels, and a card's ticket. */
interface Drawn {
  readonly labels: readonly (PlacedLabel | undefined)[];
  readonly ticket?: PlacedLabel;
}

/**
 * The warnings for one drawing: the items the SVG gives a class, those whose text is bold or
 * italic, the cards whose ticket the SVG links, and a title or description the SVG writes. The
 * link check runs as in SVG, but its `URL_REFUSED` is not repeated: text draws no link either
 * way.
 */
export function asciiWarnings(
  model: KanbanModel,
  layout: KanbanLayout,
  ctx: Omit<LinkContext, 'warn'>,
  ast?: AstNode
): AsciiWarning[] {
  const found: Record<AsciiDroppedFeature, string[]> = {
    style: [],
    emphasis: [],
    link: [],
    accessibility: [],
  };
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
    if (cls(item.classes) !== '') found.style.push(item.ast);
    if (drawn.labels.some((l) => emphasised(l?.text))) found.emphasis.push(item.ast);
    // As `drawCard`: a drawn ticket whose URL passes the check is a link.
    if (drawn.ticket && ticketUrl(item.ticket, linkCtx)) found.link.push(item.ast);
  }
  // As the SVG root: a blank value writes no `<title>` or `<desc>`.
  const acc = model.accTitle.trim() !== '' || model.accDescr.trim() !== '';
  if (acc) found.accessibility = accIds(ast);
  const out: AsciiWarning[] = [];
  for (const feature of Object.keys(found) as AsciiDroppedFeature[]) {
    const astIds = found[feature];
    if (astIds.length > 0 || (feature === 'accessibility' && acc))
      out.push(asciiDropped(feature, astIds, WHAT[feature]));
  }
  return out;
}
