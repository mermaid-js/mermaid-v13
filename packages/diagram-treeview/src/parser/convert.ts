/**
 * Value conversion as v12 ran it (parser-method §3): treeView's `valueConverter.ts` for the
 * names and annotations, `common/valueConverter.ts` for `title`, `accTitle` and `accDescr`, then
 * `parser.ts` `populate` and commonDb's setters. Every input is a token's text as v12's lexer
 * read it (the lexer's `text(j)`: on a rewritten line the box pass's text).
 *
 * The scans are linear (R-PARSE-7, pitfall 5): v12's `/[\t ]+$/` and `/\s+$/gm` backtrack over
 * a long blank run inside a line, so they are written out by hand here.
 */
export { accDescrValue, accTitleValue, titleValue } from '@mermaid-js/shared/parser/rule';
import { isBlank } from '@mermaid-js/core/parser-kit';

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

/**
 * Whether a quoted name (as `nodeName` stored it) is a markdown string (#1368): wholly in
 * backticks, with no backtick inside, as core's handler reads `"`…`"`.
 */
export function markdownName(name: string): boolean {
  return name.length >= 2 && /^`[^`]*`$/.test(name);
}

/** A node's name as written bare: a directory's with its trailing `/` (`nodeName` undone). */
export function writtenName(name: string, directory: boolean): string {
  return directory ? `${name}/` : name;
}

/** `populate`'s icon: `''` (from `icon()`) is `'none'`. */
export function nodeIcon(converted: string): string {
  return converted === '' ? 'none' : converted;
}

/** The keywords of the text statements. */
export const TITLE = 'title';
export const ACC_TITLE = 'accTitle';
export const ACC_DESCR = 'accDescr';
