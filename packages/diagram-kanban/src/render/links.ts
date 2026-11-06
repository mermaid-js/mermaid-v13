/**
 * Ticket links (D377) and the priority warning (D375): what the renderer checks per card before
 * it draws, kept apart from the drawing.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { checkUrl, type SafeUrl } from '@mermaid-js/core/svg';
import type { KanbanItem } from '../model.ts';

/** The placeholder v12 replaces in `kanban.ticketBaseUrl`. */
const PLACEHOLDER = '#TICKET#';

export type LinkContext = Pick<RenderContext, 'config' | 'securityLevel' | 'warn'> &
  Partial<Pick<RenderContext, 'linkSchemes'>>;

/**
 * The link of a card's ticket: `kanban.ticketBaseUrl` with its first `#TICKET#` replaced by the
 * ticket (a function replacer, so `$&` and the other `$` patterns in a ticket are literal; not percent-encoded,
 * as in v12), passed through `checkUrl`. Undefined without a ticket or a base URL, or when the
 * URL is refused (`checkUrl` then adds `URL_REFUSED`).
 */
export function ticketUrl(ticket: string | undefined, ctx: LinkContext): SafeUrl | undefined {
  const base = (ctx.config.kanban as Readonly<Record<string, unknown>> | undefined)?.ticketBaseUrl;
  if (!ticket || typeof base !== 'string' || base === '') return undefined;
  return checkUrl(
    base.replace(PLACEHOLDER, () => ticket),
    {
      securityLevel: ctx.securityLevel,
      linkSchemes: ctx.linkSchemes,
      warn: ctx.warn,
    }
  );
}

export const KANBAN_PRIORITY = 'KANBAN_PRIORITY';

/** The values v12 accepts without a bar (`Medium`) or with one (D375). Case-sensitive. */
const KNOWN: ReadonlySet<string> = new Set(['Very High', 'High', 'Medium', 'Low', 'Very Low']);

/**
 * One `KANBAN_PRIORITY` per render (D375, as D226) naming each card priority that is none of
 * `Very High`, `High`, `Medium`, `Low` and `Very Low`, once, in board order. A value that is not
 * a YAML string (`priorityKind: 'other'`) is never one of them and is named as written.
 * A column's priority is not drawn and not checked (D376).
 */
export function priorityWarning(cards: readonly KanbanItem[]): Warning | undefined {
  const values = new Map<string, string[]>();
  for (const card of cards) {
    const p = card.priority;
    if (p === undefined || (card.priorityKind !== 'other' && KNOWN.has(p))) continue;
    let ids = values.get(p);
    if (!ids) values.set(p, (ids = []));
    ids.push(card.ast);
  }
  if (values.size === 0) return undefined;
  const names = [...values.keys()].map((v) => JSON.stringify(v.slice(0, 60))).join(', ');
  return {
    code: KANBAN_PRIORITY,
    message: `Kanban priority ${names} is not drawn: use Very High, High, Medium, Low or Very Low (case-sensitive).`,
    astIds: [...values.values()].flat(),
  };
}
