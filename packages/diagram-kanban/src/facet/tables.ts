/**
 * The kanban facet's tables and shared helpers (DESIGN §4.5, D95). Keyword docs are not here:
 * they come from the grammar file (`generated/docs.ts`). The `@{ … }` keys are YAML, not
 * grammar tokens, so their docs are written here.
 */
import type { Range } from '@mermaid-js/core/parser-kit';
import { LINE_BREAK } from '../parser/text.ts';
import { span } from '@mermaid-js/core/parser-kit/facet';

export { code, span } from '@mermaid-js/core/parser-kit/facet';

/**
 * The `@{ … }` keys v12's `addNode` reads (spec #424 story 4, D375, D376), in the order
 * completion offers them, each with its hover doc.
 */
export const DATA_KEYS: readonly (readonly [key: string, doc: string])[] = [
  [
    'assigned',
    'Who the card is assigned to, drawn at its bottom right. Not drawn on a column, as in mermaid@12.',
  ],
  [
    'ticket',
    'The card’s ticket, drawn at its bottom left; a link when `kanban.ticketBaseUrl` is set (its `#TICKET#` is replaced by the ticket). Not drawn on a column.',
  ],
  [
    'priority',
    'The card’s priority: `Very High`, `High`, `Low` and `Very Low` (case-sensitive) draw a bar on its left edge; `Medium` draws none. Not drawn on a column.',
  ],
  ['label', 'The item’s text, in place of the text written with its id.'],
  ['icon', 'The item’s icon, as `::icon(…)` sets it. Kept but not drawn, as in mermaid@12.'],
  [
    'shape',
    'A shape name, lower case with no `_`. Checked, then ignored: every card is drawn as a card.',
  ],
];

/** Hover doc of each `@{ … }` key. */
export const KEY_DOCS: Readonly<Record<string, string>> = Object.fromEntries(DATA_KEYS);

/** The text of `at`'s line before `at`. */
export function lineBefore(text: string, at: number): string {
  let start = at;
  while (start > 0 && !LINE_BREAK.test(text.charAt(start - 1))) start--;
  return text.slice(start, at);
}

/** The text of `at`'s line from `at` on. */
export function lineAfter(text: string, at: number): string {
  let end = at;
  while (end < text.length && !LINE_BREAK.test(text.charAt(end))) end++;
  return text.slice(at, end);
}

/** Where the cursor is in a `@{ … }` pair: typing its key, or its value after `<key>:`. */
export interface DataPlace {
  /** The key typed so far (from its first letter to the cursor). */
  key?: Range;
  /** The value typed so far, after `<key>:` and the blanks after it. */
  value?: { key: string; range: Range };
}

/**
 * Where `at` is in the `@{ … }` data whose `@` is at `open`. `block`: the data is read as YAML
 * block pairs, one a line (`isBlockData`); else it is a flow mapping, pairs split at `,`.
 */
export function dataPlace(text: string, open: number, at: number, block: boolean): DataPlace {
  const first = open + 2;
  let from = at;
  while (from > first) {
    const ch = text.charAt(from - 1);
    if (LINE_BREAK.test(ch) || (!block && ch === ',')) break;
    from--;
  }
  const pair = text.slice(from, at);
  const lead = pair.length - pair.trimStart().length;
  const written = pair.slice(lead);
  if (/^[A-Za-z]*$/.test(written)) return { key: span(from + lead, at) };
  const m = /^([A-Za-z]+)[\t ]*:[\t ]*/.exec(written);
  if (!m) return {};
  return { value: { key: m[1] ?? '', range: span(from + lead + m[0].length, at) } };
}
