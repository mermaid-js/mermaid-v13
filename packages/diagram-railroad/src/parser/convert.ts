/**
 * Value conversion as v12 ran it (parser-method §3): each notation's Langium value converter
 * (`packages/parser/src/language/railroad{,-ebnf,-abnf,-peg}/valueConverter.ts`) on top of
 * `common/valueConverter.ts` for `title`, `accTitle` and `accDescr`, then the railroad DB's
 * setters. Every input is a token's text as v12's lexer read it (`cook()`ed).
 *
 * The scans are linear (R-PARSE-7, pitfall 5): v12's `/\s+$/gm` backtracks over a long blank
 * run inside a line, so it is written out by hand here.
 */
import { BACKSLASH, isBlank, isLineEnd, isSpace } from '@mermaid-js/core/parser-kit';
import type { RailroadNotation } from './tokens.ts';

/** v12's escapes in IR, EBNF and PEG strings: these three; any other `\c` is `c`. */
const ESCAPES: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t' };

/**
 * v12's `decodeEscapedString`: the text between the quotes of `image`, with `\n`, `\r` and `\t`
 * decoded and any other `\c` read as `c`. A `\` that is the last character inside the quotes
 * stays.
 */
export function decodeEscaped(image: string): string {
  const body = image.slice(1, -1);
  if (!body.includes('\\')) return body;
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i] ?? '';
    if (c.charCodeAt(0) !== BACKSLASH || i + 1 >= body.length) {
      out += c;
      continue;
    }
    const e = body[++i] ?? '';
    out += ESCAPES[e] ?? e;
  }
  return out;
}

/** A quoted string's value: decoded in IR, EBNF and PEG; the text between the quotes in ABNF. */
export function stringValue(notation: RailroadNotation, image: string): string {
  return notation === 'railroadAbnf' ? image.slice(1, -1) : decodeEscaped(image);
}

/** An EBNF special sequence `? … ?`: the text between the `?`s, trimmed. */
export function specialValue(image: string): string {
  return image.slice(1, -1).trim();
}

/** `match[1].trim().replace(/[\t ]{2,}/gm, ' ')`: the one-line value. */
function oneLine(text: string): string {
  const t = text.trim();
  return /[\t ]{2}/.test(t) ? t.replace(/[\t ]{2,}/g, ' ') : t;
}

/** Whether `text` starts and ends with the same quote (`"` alone counts, as in v12). */
function quoted(text: string): boolean {
  const q = text[0];
  return (q === '"' || q === "'") && text.endsWith(q);
}

/**
 * `title …`: the text after the keyword, trimmed, blank runs as one space; then, when it is
 * quoted, without its quotes, decoded in IR, EBNF and PEG (sliced in ABNF).
 */
export function titleValue(notation: RailroadNotation, image: string): string {
  const value = oneLine(image.slice(image.indexOf('title') + 5));
  if (!quoted(value)) return value;
  return stringValue(notation, value);
}

/** `accTitle: …`: the text after the colon, trimmed, blank runs as one space. */
export function accTitleValue(image: string): string {
  return oneLine(image.slice(image.indexOf(':', image.indexOf('accTitle')) + 1));
}

/**
 * `accDescr: …` as {@link accTitleValue}, or `accDescr { … }`: each line trimmed, blank lines
 * dropped, blank runs as one space. The DB's `.replace(/\n\s+/g, '\n')` then changes nothing.
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

/** ABNF's `parseRepeat`: `n*m` (an empty `n` is 0, an empty `m` unbounded), or exactly `n`. */
export function repeatBounds(text: string): { min: number; max: number } {
  const star = text.indexOf('*');
  if (star < 0) {
    const n = Number.parseInt(text, 10);
    return { min: n, max: n };
  }
  const lo = text.slice(0, star);
  const hi = text.slice(star + 1);
  return {
    min: lo ? Number.parseInt(lo, 10) : 0,
    max: hi ? Number.parseInt(hi, 10) : Infinity,
  };
}
