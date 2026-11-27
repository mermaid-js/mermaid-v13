/**
 * The texts C4 draws, as core's label handler takes them (#1368, #1400). A field is a user's
 * label: the parser marks one written as a quoted markdown string (`"`…`"`, its value keeping the
 * backticks as v12 stored it), which is markdown without its backticks; the handler decides how
 * any other is read (plain, or markdown under `markdownAlwaysOn`). A line joins fixed words and
 * fields (`[Container: techn]`, `1: label`): only its fields are labels, each read on its own,
 * and the line is markdown when one of them is, its other parts then escaped so they are drawn
 * as written.
 */
import type { LabelSource } from '@mermaid-js/core/text';
import type { C4Marked } from './model.ts';

/** A user's label, and whether the parser found it written as a markdown string. */
export interface C4Field {
  readonly text: string;
  readonly markdown?: true;
}

/** Fixed words (strings) and fields, drawn as one text. */
export interface C4Line {
  readonly line: readonly (string | C4Field)[];
}

/** What C4 measures: a user's label, or a line of fixed words and fields. */
export type C4Text = C4Field | C4Line;

/** Field `field` of `item`, whose value is `value`, as drawn; none when it is unset. */
export function fieldText(
  item: C4Marked,
  field: string,
  value: string | undefined
): C4Field | undefined {
  if (value === undefined) return undefined;
  return item.markdown?.includes(field)
    ? { text: value.slice(1, -1), markdown: true }
    : { text: value };
}

/** `parts` as one line. */
export const joinTexts = (parts: readonly (string | C4Field)[]): C4Line => ({ line: parts });

/** Fixed words that are no label (a type name, the legend's heading): never markdown. */
export const fixedText = (text: string): C4Line => ({ line: [text] });

/** The text as written: its parts joined, each field without a markdown string's backticks. */
export const writtenText = (t: C4Text): string =>
  'line' in t ? t.line.map((p) => (typeof p === 'string' ? p : p.text)).join('') : t.text;

// What markdown reads that plain text does not: emphasis, code spans and backslash escapes.
const RE_MARKDOWN_CHAR = /[*_`\\]/g;
const REFERENCE: Readonly<Record<string, string>> = {
  '*': '&#42;',
  _: '&#95;',
  '`': '&#96;',
  '\\': '&#92;',
};
const escaped = (text: string): string => text.replace(RE_MARKDOWN_CHAR, (c) => REFERENCE[c] ?? c);

/**
 * `t` as the label layout takes it: each field read by `read` (core's handler, which gives the
 * render its warnings), the fixed words as written; markdown when a field is, the parts that
 * are not then escaped.
 */
export function readText(t: C4Text, read: (field: C4Field) => LabelSource): LabelSource {
  const parts = 'line' in t ? t.line : [t];
  const sources = parts.map((p) => (typeof p === 'string' ? p : read(p)));
  const markdown = sources.some((s) => typeof s !== 'string' && s.markup === 'markdown');
  let text = '';
  for (const s of sources) {
    if (typeof s === 'string') text += markdown ? escaped(s) : s;
    else text += markdown && s.markup !== 'markdown' ? escaped(s.text) : s.text;
  }
  return { text, markup: markdown ? 'markdown' : 'plain', backslashBreak: false };
}
