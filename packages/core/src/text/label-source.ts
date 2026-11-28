// The label handler (D734): how a label as written is read, by one rule for every diagram type.
// It gives the text and the mode that `layoutLabel` lays out. Line breaks are settled here, so
// that a written `\n` breaks the line in every label, as `<br>` does.
import type { LabelMarkup } from './label.ts';

/** What the caller knows about one label besides its text. */
export interface LabelSourceOptions {
  /**
   * Set when a parser already found a quoted markdown string (`"`…`"`) and gives the label
   * without its wrapper.
   */
  readonly markdown?: boolean;
  /**
   * The label kind's v12 profile: whether v12 read markdown in this kind of label without a
   * markdown string. A static flag the diagram type declares once per label kind. The default
   * mode ignores it.
   */
  readonly v12Markdown?: boolean;
}

/** How a render reads its labels: `default` is D734's one rule for every type. */
export type LabelMode = 'default';

/** A label as `layoutLabel` takes it: pass `text` as the source and the rest as its options. */
export interface LabelSource {
  readonly text: string;
  readonly markup: LabelMarkup;
  /** The handler has already turned each written `\n` into a break, except in math. */
  readonly backslashBreak: false;
}

const RE_QUOTED_MARKDOWN = /^"`([^`]*)`"$/;
// A written `\n` (a backslash and an `n`, either case, as core's plain lines read it), or math,
// whose TeX holds such pairs (`\neq`) and is passed over.
const RE_WRITTEN_BREAK = /\$\$[\s\S]*?\$\$|\\n/gi;
const RE_BLANK_LINES = /\n\s*\n/g;
const RE_BR = /^<br\s*\/?>$/i;

/** `text` without the blanks and `<br>`s at its end. */
export function withoutEndBreaks(text: string): string {
  let end = text.length;
  for (;;) {
    while (end > 0 && (text[end - 1] as string) <= ' ') end--;
    if (text[end - 1] !== '>') break;
    const open = text.lastIndexOf('<', end - 1);
    if (open < 0 || !RE_BR.test(text.slice(open, end))) break;
    end = open;
  }
  return end === text.length ? text : text.slice(0, end);
}

/** `text` without the blank lines between its written lines. */
export const withoutBlankLines = (text: string): string =>
  text.includes('\n') ? text.replace(RE_BLANK_LINES, '\n') : text;

/**
 * Reads a label as written (D734). A quoted markdown string (`"`…`"`, with no backtick inside
 * the outer pair), or a label a parser marked as one, is `markdown`, without its wrapper. Any
 * other label is `plain`: tags draw and entities decode, and markdown is text. Bare backticks
 * are no markdown string, so they are drawn as written (D733).
 *
 * In every label a written `\n` breaks the line as `<br>` does, except inside `$$…$$` math.
 * Blank lines between written lines, and the breaks at the end, are dropped.
 *
 * `mode` is the render's way of reading labels; `default` is the only one, and ignores
 * `options.v12Markdown`.
 */
export function labelSource(
  label: string,
  options: LabelSourceOptions = {},
  _mode: LabelMode = 'default'
): LabelSource {
  const quoted = options.markdown ? undefined : RE_QUOTED_MARKDOWN.exec(label.trim())?.[1];
  const markdown = options.markdown === true || quoted !== undefined;
  const written = quoted ?? label;
  const broken = written.includes('\\')
    ? written.replace(RE_WRITTEN_BREAK, (m) => (m.length === 2 ? '<br>' : m))
    : written;
  return {
    text: withoutEndBreaks(withoutBlankLines(broken)),
    markup: markdown ? 'markdown' : 'plain',
    backslashBreak: false,
  };
}
