/**
 * Value conversion as v12 ran it (parser-method §3): Langium's default string converter for
 * quoted names, notes and annotations, wardley's own converter for a link's `; label`, and
 * `common/valueConverter.ts` for `title`, `accTitle` and `accDescr`, then commonDb's setters.
 * Every input is a token's text as v12's lexer read it (`cook()`ed).
 *
 * The scans are linear (R-PARSE-7, pitfall 5): v12's `/\s+$/gm` backtracks over a long blank
 * run inside a line, so it is written out by hand here.
 */
import {
  AMP,
  BACKSLASH,
  HASH,
  cook,
  isBlank,
  isLineEnd,
  isSpace,
  type SourceView,
} from '@mermaid-js/core/parser-kit';
import { entityAt } from '@mermaid-js/core/text';

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
 * A quoted name, note or annotation: a `"…"` or `'…'` string without its quotes, with `\x`
 * unescaped. Not trimmed (Langium's `convertString`).
 */
export function stringValue(image: string): string {
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

/** `;` and the rest of the line: v12's wardley value converter, `substring(1).trim()`. */
export function linkLabelValue(image: string): string {
  return image.slice(1).trim();
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

/** A coordinate as the model holds it ({@link toPercent}). */
export interface Percent {
  /** 0–100; 100 when out of range. */
  readonly percent: number;
  /** Written as a fraction of the axis (at most 1), not as a percentage. */
  readonly fraction: boolean;
  /** Inside 0–100 % (else `WARDLEY_OUT_OF_RANGE`, kept as 100). */
  readonly inRange: boolean;
}

/**
 * A coordinate as the model holds it (v12 `toPercent`, D428): up to 1 a fraction of the axis,
 * above it a percentage; outside 0–100 out of range (`WARDLEY_OUT_OF_RANGE`) and kept as 100.
 */
export function toPercent(value: number): Percent {
  const fraction = value <= 1;
  const percent = fraction ? value * 100 : value;
  return percent < 0 || percent > 100
    ? { percent: 100, fraction, inRange: false }
    : { percent, fraction, inRange: true };
}
