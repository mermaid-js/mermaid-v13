/**
 * The text of a source range as v12 drew it, for the langium-family diagrams whose renderer
 * turned `#name;` / `#123;` codes into characters (event modeling, wardley). Its own chunk, so
 * the diagrams that do not draw codes this way do not load it.
 */
import { AMP, cook, HASH } from '@mermaid-js/core/parser-kit';
import type { SourceView } from '@mermaid-js/core/parser-kit';
import { decodeEntities } from '@mermaid-js/core/text';

/**
 * The text of the source range `[start, end)` as v12 drew it: v12's lexer's text (`cook()`),
 * with each `#name;` / `#123;` code written as its character (GAPS #493). v12 turned a code
 * into a placeholder, wrote the text with `.text()` and turned the placeholders into `&name;`
 * in the SVG markup, so the page showed the character; an `&name;` the author wrote was escaped
 * by `.text()` and shows as written. `cook()` gives both as `&name;`, so the range is cooked in
 * pieces between the author's `&`s, and only the references inside a piece (`cook()`'s) are
 * decoded. A name core does not know (`#y;`) stays `&y;`, as a browser shows it.
 */
export function displayText(src: string, start: number, end: number, view: SourceView): string {
  if (!has(src, start, end, HASH)) return cook(src, start, end, view);
  let out = '';
  let from = start;
  for (let p = start; p < end; p++) {
    if (src.charCodeAt(p) !== AMP) continue;
    // The `&` itself through cook(), which drops it inside a removed span.
    out += decodeEntities(cook(src, from, p, view)) + cook(src, p, p + 1, view);
    from = p + 1;
  }
  return out + decodeEntities(cook(src, from, end, view));
}

/** Whether `src[start…end)` holds the character `c` (a scan of the range only, R-PARSE-7). */
function has(src: string, start: number, end: number, c: number): boolean {
  for (let i = start; i < end; i++) if (src.charCodeAt(i) === c) return true;
  return false;
}
