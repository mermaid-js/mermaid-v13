// The label handler (D734): how a label as written is read, by one rule for every diagram type.
// It gives the text and the mode that `layoutLabel` lays out. Line breaks are settled here, so
// that a written `\n` breaks the line in every label, as `<br>` does. v12's markdown reading of
// plain labels lives here too, as the compatibility branch, and nowhere else.
import type { ResolvedConfig } from '../config/resolve.ts';
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
   * markdown string. A static flag the diagram type declares once per label kind. Read only
   * when the config sets `legacyMarkdown` (see {@link labelSource}).
   */
  readonly v12Markdown?: boolean;
}

/**
 * The part of the resolved config the handler reads: the one switch of D734's compatibility
 * mode. A diagram passes its `ctx.config` as it is and never reads the key itself.
 */
export type LabelConfig = Pick<ResolvedConfig, 'legacyMarkdown'>;

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

const RE_LIST_ITEM = /^\s*[-*+] /;
const RE_TICKS = /`+/g;
// In a code span: math, which inline spans read before emphasis, and the emphasis markers. An
// `_` between two letters or digits (`snake_case`, `fa:fa-a_b`) is never a marker, so it stays
// for the inline spans (icons) to find.
const RE_IN_SPAN = /\$\$[\s\S]*?\$\$|\*|(?<![A-Za-z\d])_|_(?![A-Za-z\d])/g;
const REFERENCE: Readonly<Record<string, string>> = { '*': '&#42;', _: '&#95;' };

/**
 * `text` with the `*` and `_` inside each code span as character references, so they are text.
 * A code span is found as v12's reader (marked) found it: a run of backticks closed by the next
 * run of the same length; a run with no such closer is text. Linear in the length of `text`.
 */
function spansAsText(text: string): string {
  if (!text.includes('`')) return text;
  const runs = [...text.matchAll(RE_TICKS)];
  // For each run, the index of the next run of the same length (-1 when there is none).
  const next: number[] = [];
  const last = new Map<number, number>();
  for (let i = runs.length - 1; i >= 0; i--) {
    const length = runs[i]![0].length;
    next[i] = last.get(length) ?? -1;
    last.set(length, i);
  }
  let out = '';
  let at = 0;
  for (let i = 0; i < runs.length; i++) {
    const j = next[i]!;
    if (j < 0) continue;
    const end = runs[j]!.index + runs[j]![0].length;
    out +=
      text.slice(at, runs[i]!.index) +
      text.slice(runs[i]!.index, end).replace(RE_IN_SPAN, (m) => REFERENCE[m] ?? m);
    at = end;
    i = j;
  }
  return out + text.slice(at);
}

/**
 * v12's Markdown reading of a label written without a markdown string (D564, D610): `kept` is
 * `label` with its blank lines and end breaks dropped. The mode is `emphasis`, with the emphasis
 * markers inside a code span written as character references, so the span is drawn as written;
 * or `plain` for a label that starts with a list marker, so that all of it is.
 */
export const v12Markdown = (
  label: string,
  kept: string
): { readonly text: string; readonly markup: LabelMarkup } =>
  RE_LIST_ITEM.test(label)
    ? { text: kept, markup: 'plain' }
    : { text: spansAsText(kept), markup: 'emphasis' };

/**
 * Reads a label as written (D734). A quoted markdown string (`"`…`"`, with no backtick inside
 * the outer pair), or a label a parser marked as one, is `markdown`, without its wrapper. Any
 * other label is `plain`: tags draw and entities decode, and markdown is text. Bare backticks
 * are no markdown string, so they are drawn as written (D733).
 *
 * In every label a written `\n` breaks the line as `<br>` does, except inside `$$…$$` math.
 * Blank lines between written lines, and the breaks at the end, are dropped.
 *
 * `config` is the render's resolved config (`ctx.config`), passed as it is. With
 * `legacyMarkdown` set, a label whose kind has `options.v12Markdown` and that is no markdown
 * string is read as v12 read it ({@link v12Markdown}): bold and italic, with code spans and list
 * markers as written. Tags and line breaks are read as in the default mode.
 */
export function labelSource(
  label: string,
  options: LabelSourceOptions = {},
  config: LabelConfig = {}
): LabelSource {
  const quoted = options.markdown ? undefined : RE_QUOTED_MARKDOWN.exec(label.trim())?.[1];
  const markdown = options.markdown === true || quoted !== undefined;
  const written = quoted ?? label;
  const broken = written.includes('\\')
    ? written.replace(RE_WRITTEN_BREAK, (m) => (m.length === 2 ? '<br>' : m))
    : written;
  const text = withoutEndBreaks(withoutBlankLines(broken));
  if (!markdown && options.v12Markdown && config.legacyMarkdown)
    return { ...v12Markdown(written, text), backslashBreak: false };
  return { text, markup: markdown ? 'markdown' : 'plain', backslashBreak: false };
}
