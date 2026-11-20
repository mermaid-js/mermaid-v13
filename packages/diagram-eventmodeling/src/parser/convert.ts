// cspell:words gwts dedented
/**
 * Value conversion (parser-method §3). Every input is a token's text as v12's lexer read it
 * (`cook()`ed).
 *
 * - `title`, `accTitle`, `accDescr` (D524): v12's event modeling grammar has its own terminals,
 *   which the common value converter never converted, so v12 stored the raw image, keyword
 *   included. v13 converts them as `common/valueConverter.ts` does every other Langium type's
 *   (then commonDb's setters, which change nothing more).
 * - Data (D523): the text between the braces or quotes, dedented and trimmed (Pele's
 *   `blockText`), where v12 sliced with an off-by-one.
 *
 * The scans are linear (R-PARSE-7, pitfall 5): v12's `/\s+$/gm` backtracks over a long blank
 * run inside a line, so it is written out by hand here.
 */
export { accDescrValue, accTitleValue, titleValue } from '@mermaid-js/shared/parser/rule';
import { AMP, cook, HASH, LBRACE } from '@mermaid-js/core/parser-kit';
import type { SourceView } from '@mermaid-js/core/parser-kit';
import { decodeEntities } from '@mermaid-js/core/text';
import { expandTabs } from '../tabs.ts';

/**
 * The text of the source range `[start, end)` as v12 drew it: v12's lexer's text (`cook()`),
 * with each `#name;` / `#123;` code written as its character. v12 turned a code into a
 * placeholder and its renderer turned that into `&name;` in the page, which showed the
 * character; `cook()` gives it as `&name;`, so the range is cooked in pieces between the
 * author's own `&`s, and only the references inside a piece (`cook()`'s) are decoded. A name
 * core does not know (`#y;`) stays `&y;`.
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

/**
 * D523: a data token's text: between the braces (`{ … }`, the first and the last) or the quotes
 * (`"…"`, `'…'`), without its blank first and last lines, each line's trailing blanks, and the
 * indentation its lines share. Tabs are expanded to the next tab stop first (`expandTabs`,
 * columns from the start of each line of the text), so tab indentation loses its common indent
 * and nests as written.
 */
export function dataText(image: string): string {
  const inner =
    image.charCodeAt(0) === LBRACE ? image.slice(1, image.lastIndexOf('}')) : image.slice(1, -1);
  const lines = inner.split('\n').map(expandTabs);
  let first = 0;
  let last = lines.length - 1;
  while (first <= last && (lines[first] ?? '').trim() === '') first++;
  while (last >= first && (lines[last] ?? '').trim() === '') last--;
  let indent = Infinity;
  for (let k = first; k <= last; k++) {
    const line = lines[k] ?? '';
    const body = line.trimStart();
    if (body !== '') indent = Math.min(indent, line.length - body.length);
  }
  const out: string[] = [];
  for (let k = first; k <= last; k++) {
    const line = lines[k] ?? '';
    out.push(line.slice(Math.min(indent, line.length)).trimEnd());
  }
  return out.join('\n');
}
