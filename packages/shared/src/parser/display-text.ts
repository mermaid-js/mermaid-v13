/**
 * The text of a source range as v12 drew it, for the diagrams whose renderer turned `#name;` /
 * `#123;` codes into characters and wrote every other text as is (event modeling, wardley,
 * railroad's tokens). Its own chunk, so the diagrams that do not draw codes this way do not
 * load it.
 */
import { AMP, cook, HASH } from '@mermaid-js/core/parser-kit';
import type { SourceView } from '@mermaid-js/core/parser-kit';
import { decodeEntities } from '@mermaid-js/core/text';

/**
 * An `&` the author wrote, held back while the codes are decoded: U+FDD0, a code point Unicode
 * keeps out of text, so no reference starts at it.
 */
const TYPED_AMP = '\uFDD0';

/**
 * The text of the source range `[start, end)` as v12 drew it: v12's lexer's text (`cook()`),
 * with each `#name;` / `#123;` code written as its character (GAPS #493). v12 turned a code
 * into a placeholder, wrote the text with `.text()` and turned the placeholders into `&name;`
 * in the SVG markup, so the page showed the character; an `&name;` the author wrote was escaped
 * by `.text()` and shows as written. `cook()` gives both as `&name;`, so each `&` the author
 * wrote is held back while the references `cook()` made are decoded. A name core does not know
 * (`#y;`) stays as written (D561).
 *
 * `convert`, when given, is the token's value conversion (unquoting, `\n`). It runs on the cooked
 * text before the codes are decoded, as v12 ran it on its placeholders, so a `#bsol;` or a
 * `#quot;` is a character of the value, never an escape or a closing quote.
 */
export function displayText(
  src: string,
  start: number,
  end: number,
  view: SourceView,
  convert: (cooked: string) => string = (s) => s
): string {
  if (!has(src, start, end, HASH)) return convert(cook(src, start, end, view));
  let out = '';
  let from = start;
  for (let p = start; p < end; p++) {
    if (src.charCodeAt(p) !== AMP) continue;
    // The `&` itself through cook(), which drops it inside a removed span.
    out += cook(src, from, p, view) + cook(src, p, p + 1, view).replace('&', TYPED_AMP);
    from = p + 1;
  }
  out += cook(src, from, end, view);
  return decodeEntities(convert(out)).replaceAll(TYPED_AMP, '&');
}

/** Whether `src[start…end)` holds the character `c` (a scan of the range only, R-PARSE-7). */
function has(src: string, start: number, end: number, c: number): boolean {
  for (let i = start; i < end; i++) if (src.charCodeAt(i) === c) return true;
  return false;
}
