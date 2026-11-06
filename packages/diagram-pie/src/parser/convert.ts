/**
 * Value conversion as v12 ran it (parser-method §3): Langium's default string converter for
 * slice labels, and `common/valueConverter.ts` for `title`, `accTitle` and `accDescr`, then
 * commonDb's setters. Every input is a token's text as v12's lexer read it (`cook()`ed).
 *
 * The scans are linear (R-PARSE-7, pitfall 5): v12's `/\s+$/gm` backtracks over a long blank
 * run inside a line, so it is written out by hand here.
 */
import { BACKSLASH, isBlank, isLineEnd, isSpace } from '@mermaid-js/core/parser-kit';

/** Langium's `convertEscapeCharacter`: the control escapes, and any other `\x` as `x`. */
const ESCAPES: Readonly<Record<string, string>> = {
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  0: '\0',
};

/**
 * A slice label: a `"…"` or `'…'` string without its quotes, with `\x` unescaped. Not
 * trimmed: `pie/valueConverter.ts` trims a rule that does not exist.
 */
export function labelValue(image: string): string {
  const body = image.slice(1, -1);
  if (!body.includes('\\')) return body;
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i] ?? '';
    if (c.charCodeAt(0) !== BACKSLASH) {
      out += c;
      continue;
    }
    const e = body[++i] ?? '';
    out += ESCAPES[e] ?? e;
  }
  return out;
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
