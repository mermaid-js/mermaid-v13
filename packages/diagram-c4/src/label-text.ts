/**
 * The texts C4 draws, as core's label handler takes them (spec #1368). A field the parser marked
 * as a quoted markdown string (`"`…`"`, its value keeping the backticks as v12 stored it) is
 * markdown without its backticks; every other text is plain, bare backticks included. A line
 * that joins fixed words and fields (`[Container: techn]`, `1: label`) is markdown when one of
 * its fields is: its other parts are then escaped, so they are drawn as written.
 */
import type { C4Marked } from './model.ts';

/** A text to draw, and whether it is markdown. */
export interface C4Text {
  readonly text: string;
  readonly markdown?: true;
}

/** Field `field` of `item`, whose value is `value`, as drawn; none when it is unset. */
export function fieldText(
  item: C4Marked,
  field: string,
  value: string | undefined
): C4Text | undefined {
  if (value === undefined) return undefined;
  return item.markdown?.includes(field)
    ? { text: value.slice(1, -1), markdown: true }
    : { text: value };
}

// What markdown reads that plain text does not: emphasis, code spans and backslash escapes. A
// written `\n` stays: it breaks the line in both.
const RE_MARKDOWN_CHAR = /[*_`]|\\(?![nN])/g;
const REFERENCE: Readonly<Record<string, string>> = {
  '*': '&#42;',
  _: '&#95;',
  '`': '&#96;',
  '\\': '&#92;',
};

/** `parts` as one line: markdown when one part is, the plain parts then escaped. */
export function joinTexts(parts: readonly (C4Text | string)[]): C4Text {
  const markdown = parts.some((p) => typeof p !== 'string' && p.markdown);
  let text = '';
  for (const part of parts) {
    const { text: written, markdown: own } = typeof part === 'string' ? { text: part } : part;
    if (own || !markdown) text += written;
    else text += written.replace(RE_MARKDOWN_CHAR, (c) => REFERENCE[c] ?? c);
  }
  return markdown ? { text, markdown: true } : { text };
}
