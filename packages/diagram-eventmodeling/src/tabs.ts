/**
 * Tabs in data text (D523, shown as written): each tab moves to the next tab stop, every
 * {@link TAB_STOP} columns from the start of its line, so tab and mixed tab/space indentation
 * keep their nesting when the text is dedented and drawn in mono. Read by the parser's data
 * conversion and by the layout (for a model built by hand).
 */

/** Columns between tab stops (an editor's common default; v12 drew a tab as one blank). */
export const TAB_STOP = 4;

/** `line` with each tab as the blanks up to the next tab stop (linear, R-PARSE-7). */
export function expandTabs(line: string): string {
  if (!line.includes('\t')) return line;
  let out = '';
  // Code units, so the columns count as `String.length` does.
  for (const c of line.split('')) {
    out += c === '\t' ? ' '.repeat(TAB_STOP - (out.length % TAB_STOP)) : c;
  }
  return out;
}
