// A label v12 drew through `createText` with Markdown on (`labelType: 'markdown'`), as core's
// label layout reads it (D564, D610). v12's Markdown reader read bold and italic, and handed a
// list item and a code span back as written, with what they hold. Its HTML label then showed
// blank lines between written lines and a break at the end as nothing. A subpath of its own,
// which only the diagrams with such labels load (D557).
import type { LabelMarkup } from './label.ts';

const RE_LIST_ITEM = /^\s*[-*+] /;
const RE_TICKS = /`+/g;
// In a code span: math, which inline spans read before emphasis, and the emphasis markers. An
// `_` between two letters or digits (`snake_case`, `fa:fa-a_b`) is never a marker, so it stays
// for the inline spans (icons) to find.
const RE_IN_SPAN = /\$\$[\s\S]*?\$\$|\*|(?<![A-Za-z\d])_|_(?![A-Za-z\d])/g;
const REFERENCE: Readonly<Record<string, string>> = { '*': '&#42;', _: '&#95;' };
const RE_BLANK_LINES = /\n\s*\n/g;
const RE_BR = /^<br\s*\/?>$/i;

/** `text` without the blanks and `<br>`s at its end. */
function withoutEndBreaks(text: string): string {
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

/** The `layoutLabel` options of a v12 Markdown label. */
export interface V12LabelMode {
  readonly markup: LabelMarkup;
  readonly backslashBreak: false;
}

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
 * A v12 Markdown label for `layoutLabel`, as `[text, options]`. The text has the blank lines
 * between written lines and the breaks at its end dropped. The mode is `emphasis`, with the
 * emphasis markers inside a code span written as character references, so the span is drawn as
 * written; or `plain` for a label that starts with a list marker, so that all of it is. A written
 * `\n` is text in both.
 */
export const v12Label = (text: string): [text: string, mode: V12LabelMode] => {
  const list = RE_LIST_ITEM.test(text);
  const kept = withoutEndBreaks(text.includes('\n') ? text.replace(RE_BLANK_LINES, '\n') : text);
  return [
    list ? kept : spansAsText(kept),
    { markup: list ? 'plain' : 'emphasis', backslashBreak: false },
  ];
};
