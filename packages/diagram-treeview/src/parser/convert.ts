/**
 * Value conversion as v12 ran it (parser-method §3): treeView's `valueConverter.ts` for the
 * names and annotations, `common/valueConverter.ts` for `title`, `accTitle` and `accDescr`, then
 * `parser.ts` `populate` and commonDb's setters. Every input is a token's text as v12's lexer
 * read it (the lexer's `text(j)`: on a rewritten line the box pass's text).
 *
 * The scans are linear (R-PARSE-7, pitfall 5): v12's `/[\t ]+$/` and `/\s+$/gm` backtrack over
 * a long blank run inside a line, so they are written out by hand here.
 */
import { isBlank, isLineEnd, isSpace } from '@mermaid-js/core/parser-kit';

/** `/[\t ]+$/` removed: the end of `text` without its trailing blanks. */
function trimBlanksEnd(text: string): string {
  let e = text.length;
  while (e > 0 && isBlank(text.charCodeAt(e - 1))) e--;
  return text.slice(0, e);
}

/** INDENTATION: its length (a tab counts 1). */
export function indentValue(image: string): number {
  return image.length;
}

/** QUOTED_NAME: the first and last character (the quotes) off; no escapes. */
export function quotedValue(image: string): string {
  return image.slice(1, -1);
}

/** BARE_NAME: the trailing blanks off; inner runs are kept. */
export function bareValue(image: string): string {
  return trimBlanksEnd(image);
}

/** CLASS_ANNOTATION ` :::name`: trimmed, `:::` off, trimmed again. */
export function classValue(image: string): string {
  return image.trim().slice(3).trim();
}

/** ICON_ANNOTATION ` icon(name)`: trimmed, `icon(` and `)` off (`icon()` gives `''`). */
export function iconValue(image: string): string {
  const t = image.trim();
  return t.substring(5, t.length - 1);
}

/** DESC_ANNOTATION ` ## text`: trimmed, `##` off, trimmed again. */
export function descValue(image: string): string {
  return image.trim().slice(2).trim();
}

/** What `populate` stored for a name: the trailing `/` cut off and read as a directory. */
export function nodeName(converted: string): { name: string; directory: boolean } {
  const directory = converted.endsWith('/');
  return { name: directory ? converted.slice(0, -1) : converted, directory };
}

/** `populate`'s icon: `''` (from `icon()`) is `'none'`. */
export function nodeIcon(converted: string): string {
  return converted === '' ? 'none' : converted;
}

/** `match[1].trim().replace(/[\t ]{2,}/gm, ' ')`: the one-line value. */
function oneLine(text: string): string {
  const t = text.trim();
  return /[\t ]{2}/.test(t) ? t.replace(/[\t ]{2,}/g, ' ') : t;
}

/** `title …`: the text after the keyword, trimmed, blank runs as one space (`title` alone: `''`). */
export function titleValue(image: string): string {
  return oneLine(image.slice(image.indexOf('title') + 5));
}

/** `accTitle: …`: the text after the colon, as {@link titleValue}; commonDb trims the start. */
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
