/** Ticket links (D377): the URL a card's ticket links to, checked before it is drawn. */
import { checkUrl, type SafeUrl } from '@mermaid-js/core/svg';
import type { KanbanRenderContext } from './context.ts';

/** The placeholder v12 replaces in `kanban.ticketBaseUrl`. */
const PLACEHOLDER = '#TICKET#';

export type LinkContext = Pick<
  KanbanRenderContext,
  'config' | 'securityLevel' | 'linkSchemes' | 'warn'
>;

/**
 * The link of a card's ticket: `kanban.ticketBaseUrl` with its first `#TICKET#` replaced by the
 * ticket (a function replacer, so `$&` and the other `$` patterns in a ticket are literal; not
 * percent-encoded, as in v12), passed through `checkUrl`. Undefined without a ticket or a base URL, or when the
 * URL is refused (`checkUrl` then adds `URL_REFUSED`).
 */
export function ticketUrl(ticket: string | undefined, ctx: LinkContext): SafeUrl | undefined {
  const base = ctx.config.kanban?.ticketBaseUrl;
  if (!ticket || typeof base !== 'string' || base === '') return undefined;
  return checkUrl(
    base.replace(PLACEHOLDER, () => ticket),
    ctx
  );
}
