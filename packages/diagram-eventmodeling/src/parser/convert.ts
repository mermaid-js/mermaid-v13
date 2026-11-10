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
import {
  AMP,
  HASH,
  cook,
  isBlank,
  isLineEnd,
  isSpace,
  LBRACE,
  type SourceView,
} from '@mermaid-js/core/parser-kit';
import { entityAt } from '@mermaid-js/core/text';
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
    out += decodeReferences(cook(src, from, p, view)) + cook(src, p, p + 1, view);
    from = p + 1;
  }
  return out + decodeReferences(cook(src, from, end, view));
}

/** Whether `src[start…end)` holds the character `c` (a scan of the range only, R-PARSE-7). */
function has(src: string, start: number, end: number, c: number): boolean {
  for (let i = start; i < end; i++) if (src.charCodeAt(i) === c) return true;
  return false;
}

/** Every character reference core knows in `text`, as its character. */
function decodeReferences(text: string): string {
  let i = text.indexOf('&');
  if (i < 0) return text;
  let out = '';
  let from = 0;
  for (; i >= 0; i = text.indexOf('&', i + 1)) {
    const ref = entityAt(text, i);
    if (ref === undefined) continue;
    out += text.slice(from, i) + ref[0];
    from = i + ref[1];
    i = from - 1;
  }
  return out + text.slice(from);
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

/** `match[1].trim().replace(/[\t ]{2,}/gm, ' ')`: the one-line value. */
function oneLine(text: string): string {
  const t = text.trim();
  return /[\t ]{2}/.test(t) ? t.replace(/[\t ]{2,}/g, ' ') : t;
}

/** `title …`: the text after the keyword, trimmed, blank runs as one space. */
export function titleValue(image: string): string {
  return oneLine(image.slice(image.indexOf('title') + 5));
}

/** `accTitle: …`: the text after the colon, as {@link titleValue}. */
export function accTitleValue(image: string): string {
  return oneLine(image.slice(image.indexOf(':', image.indexOf('accTitle')) + 1));
}

/**
 * `accDescr: …` as {@link titleValue}, or `accDescr { … }`: each line trimmed, blank lines
 * dropped, blank runs as one space. commonDb's `.replace(/\n\s+/g, '\n')` then changes nothing.
 */
export function accDescrValue(image: string): string {
  let j = image.indexOf('accDescr') + 8;
  while (isBlank(image.charCodeAt(j))) j++;
  if (image[j] === ':') return oneLine(image.slice(j + 1));
  const body = image.slice(image.indexOf('{', j) + 1, image.lastIndexOf('}'));
  return dropLineEnds(dropLineStarts(body))
    .replace(/[\t ]{2,}/g, ' ')
    .replace(/[\n\r]{2,}/g, '\n');
}

/**
 * `.replace(/^\s*\/gm, '')`: the whitespace at each line start goes, and a run of it takes the
 * empty lines after it along.
 */
function dropLineStarts(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  for (;;) {
    while (i < n && isSpace(text.charCodeAt(i))) i++;
    const from = i;
    while (i < n && !isLineEnd(text.charCodeAt(i))) i++;
    if (i >= n) return out + text.slice(from);
    out += text.slice(from, ++i);
  }
}

/**
 * `.replace(/\s+$/gm, '')`: in each whitespace run, the part before its last line end goes (all
 * of it at the end of the text). A run with no line end after its first character stays.
 */
function dropLineEnds(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const from = i;
    while (i < n && !isSpace(text.charCodeAt(i))) i++;
    out += text.slice(from, i);
    if (i >= n) break;
    const a = i;
    let last = -1;
    for (; i < n && isSpace(text.charCodeAt(i)); i++) {
      if (i > a && isLineEnd(text.charCodeAt(i))) last = i;
    }
    if (i === n) break;
    out += text.slice(last < 0 ? a : last, i);
  }
  return out;
}
