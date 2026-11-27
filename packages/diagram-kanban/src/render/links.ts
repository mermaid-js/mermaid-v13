/** Ticket links (D377): the URL a card's ticket links to, checked before it is drawn. */
import { checkUrl, type SafeUrl } from '@mermaid-js/core/svg';
import type { KanbanRenderContext } from './context.ts';

/** The placeholder v12 replaces in `kanban.ticketBaseUrl`. */
const PLACEHOLDER = '#TICKET#';

/**
 * The tags a plain label draws as formatting (D710), and `<br>`, written as core's label layout
 * reads a tag: any case, attributes allowed. A ticket links by its text without them (D712).
 */
const RE_DRAWN_TAG = /<\/?(?:b|strong|i|em|u|ins|s|strike|del|sub|sup|br)(?:\s[^<>]*)?\/?>/gi;

export type LinkContext = Pick<
  KanbanRenderContext,
  'config' | 'securityLevel' | 'linkSchemes' | 'warn'
>;

/**
 * The link of a card's ticket: `kanban.ticketBaseUrl` with its first `#TICKET#` replaced by the
 * ticket (a function replacer, so `$&` and the other `$` patterns in a ticket are literal; not
 * percent-encoded, as in v12), passed through `checkUrl`. The ticket's drawn tags are left out,
 * so `<b>T-1</b>` links to `…T-1` (D712; v12 put them in the URL as written); everything else
 * goes in as written. Undefined without a ticket or a base URL, or when the URL is refused
 * (`checkUrl` then adds `URL_REFUSED`).
 */
export function ticketUrl(ticket: string | undefined, ctx: LinkContext): SafeUrl | undefined {
  const base = ctx.config.kanban?.ticketBaseUrl;
  const text = ticket?.replace(RE_DRAWN_TAG, '');
  if (!text || typeof base !== 'string' || base === '') return undefined;
  return checkUrl(
    base.replace(PLACEHOLDER, () => text),
    ctx
  );
}
