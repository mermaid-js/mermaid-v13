// A label v12 drew through `createText` with Markdown on (`labelType: 'markdown'`), as core's
// label layout reads it (D564, D610). v12's Markdown reader read bold and italic, and handed a
// list item and a code span back as written, with what they hold. Its HTML label then showed
// blank lines between written lines and a break at the end as nothing. A subpath of its own,
// which only the diagrams with such labels load (D557). The reading itself is the label
// handler's compatibility branch (`v12Markdown`, D734); T14 deletes this file.
import type { LabelMarkup } from './label.ts';
import { v12Markdown, withoutBlankLines, withoutEndBreaks } from './label-source.ts';

/** The `layoutLabel` options of a v12 Markdown label. */
export interface V12LabelMode {
  readonly markup: LabelMarkup;
  readonly backslashBreak: false;
}

/**
 * A v12 Markdown label for `layoutLabel`, as `[text, options]`. The text has the blank lines
 * between written lines and the breaks at its end dropped, and is read by {@link v12Markdown}.
 * A written `\n` is text.
 */
export const v12Label = (text: string): [text: string, mode: V12LabelMode] => {
  const read = v12Markdown(text, withoutEndBreaks(withoutBlankLines(text)));
  return [read.text, { markup: read.markup, backslashBreak: false }];
};
