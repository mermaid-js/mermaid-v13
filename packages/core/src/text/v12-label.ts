// A label v12 drew through `createText` with Markdown on (`labelType: 'markdown'`), as core's
// label layout reads it (D564). v12's Markdown reader read bold and italic, and handed a list
// item and a code span back as written, with what they hold. Its HTML label then showed blank
// lines between written lines and a break at the end as nothing. A subpath of its own, which only
// the diagrams with such labels load (D557).
import type { LabelMarkup } from './label.ts';

const RE_AS_WRITTEN = /^\s*[-*+] |`[^`]+`/;
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
 * A v12 Markdown label for `layoutLabel`, as `[text, options]`. The text has the blank lines
 * between written lines and the breaks at its end dropped. The mode is `emphasis`, or `plain` for
 * a label that starts with a list marker or holds a code span, so that it is drawn as written. A
 * written `\n` is text in both.
 */
export const v12Label = (text: string): [text: string, mode: V12LabelMode] => [
  withoutEndBreaks(text.includes('\n') ? text.replace(RE_BLANK_LINES, '\n') : text),
  { markup: RE_AS_WRITTEN.test(text) ? 'plain' : 'emphasis', backslashBreak: false },
];
