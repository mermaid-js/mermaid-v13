/**
 * The character sets kanban's parser and language facet share (one definition each):
 * - the blanks a `:::` line is split into class words at (HTML class-attribute words, v12's
 *   `cssClasses` split);
 * - the line breaks of the text (what a regex `.` stops at, plus CR);
 * - whether `@{ … }` data is block pairs or a flow mapping: v12's `addNode` read data holding a
 *   line break (after CRs became LFs, so a CR counts) as `<data>\n`, and other data as
 *   `{\n<data>\n}`.
 */
import { CR, LF } from '@mermaid-js/core/parser-kit';

/** One blank a `:::` line is split at. */
export const CLASS_BLANK = /[\t\n\f\r ]/;
/** The class words of a `:::` line. */
const CLASS_WORD = /[^\t\n\f\r ]+/g;

/** The words of a `:::` line (v12's classes), each with its offset in `text`. */
export function classWords(text: string): { word: string; at: number }[] {
  return [...text.matchAll(CLASS_WORD)].map((m) => ({ word: m[0], at: m.index }));
}

/** One line break: LF, CR, U+2028 or U+2029. */
export const LINE_BREAK = /[\n\r\u2028\u2029]/;
/** The text of the first line. */
export const FIRST_LINE = /^[^\n\r\u2028\u2029]*/;

const LS = 0x2028;
const PS = 0x2029;

/** Whether the character code `c` is a {@link LINE_BREAK}. */
export const isLineBreak = (c: number): boolean => c === LF || c === CR || c === LS || c === PS;

/**
 * Whether the `@{ … }` data `text` (between `@{` and `}`, as written or as v12 read it) is read
 * as block pairs, one a line, rather than as a flow mapping whose pairs `,` separates.
 */
export const isBlockData = (text: string): boolean => /[\n\r]/.test(text);
