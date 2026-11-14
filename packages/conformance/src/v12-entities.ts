/**
 * v12's entity placeholders, for every type's v12 side. v12 turned each `#name;` and `#123;` of
 * the source into a placeholder before its parser ran (`encodeEntities`: `ﬂ°name¶ß`,
 * `ﬂ°°123¶ß`), so its DBs and token streams hold placeholders.
 */
import { decodePlaceholders } from '@mermaid-js/core/parser-kit/support';
import { entityAt } from '@mermaid-js/core/text';

/**
 * v12's own `decodeEntities` (`utils.ts`): each placeholder as the `&name;` or `&#123;` its
 * renderer wrote. Nothing of v13 is applied here. Where v13 reads a text differently on purpose,
 * such as an unknown `#name;` kept as written (D561), the models differ and the source is listed
 * in `divergences/`.
 */
export function v12DecodeEntities(text: string): string {
  return text.replace(/ﬂ°°/g, '&#').replace(/ﬂ°/g, '&').replace(/¶ß/g, ';');
}

/**
 * The text of a v12 token as v13's token streams report it, for lexer parity, which compares two
 * token streams after the normalisation each spec lists and has no divergence list: v12's
 * `decodeEntities`, except that a `#name;` whose name core cannot decode stays as written (D561).
 * It is the decoder the v13 parsers run (`decodePlaceholders`), so the two cannot drift apart.
 */
export const v12TokenText = decodePlaceholders;

/**
 * Whether `source` holds a `#name;` whose name core cannot decode, which v13 keeps as written and
 * v12 made `&name;` (D561). The fuzz specs leave such an input out, since a generated input is no
 * corpus item that `divergences/` could list; `fuzz/decided.ts` holds the decision's example.
 * Directives are taken out first, as both versions do: one may sit inside the code.
 */
export function hasUnknownEntityName(source: string): boolean {
  for (const m of source.replace(/%%\{[^]*?\}%%/g, '').matchAll(/#(\w+);/g)) {
    const name = m[1] ?? '';
    if (!/^\d+$/.test(name) && !entityAt(`&${name};`, 0)) return true;
  }
  return false;
}
